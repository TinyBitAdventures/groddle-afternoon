/**
 * LEVEL BUILDER (spec docs/level-builder/spec.md, P0): a small JSON Schema 2020-12 checker for
 * zone.schema.json, written for the keywords that schema uses so the repo needs no Ajv. Pure: no
 * DOM, no Node, so the editor, the validator (P2) and the tests share it.
 *
 * Supported keywords: type, enum, const, minimum, maximum, exclusiveMinimum, exclusiveMaximum,
 * minLength, maxLength, pattern, required, properties, additionalProperties, propertyNames,
 * items, minItems, maxItems, allOf, anyOf, $ref (local "#/$defs/<name>" only), boolean schemas,
 * plus the annotations $schema, $id, title and description. Any other keyword is an error at
 * compile time (strict, like Ajv's strict mode), so the schema can never quietly outgrow the checker.
 *
 *   const check = compileSchema(schema);          // the whole document
 *   const street = compileSchema(schema, '#/$defs/street');
 *   street(json) -> [] or [{ path: '/layers/0/z', keyword: 'maximum', message }]
 */

const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', '$defs', '$comment', 'default', 'examples']);
const KEYWORDS = new Set([
  'type', 'enum', 'const', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'minLength', 'maxLength', 'pattern', 'required', 'properties', 'additionalProperties',
  'propertyNames', 'items', 'minItems', 'maxItems', 'allOf', 'anyOf', '$ref',
]);

/** PURE: the JSON type names a value has (an integer is both "integer" and "number"). */
export function jsonTypes(v) {
  if (v === null) return ['null'];
  if (Array.isArray(v)) return ['array'];
  if (typeof v === 'number') return Number.isInteger(v) ? ['integer', 'number'] : ['number'];
  if (typeof v === 'string') return ['string'];
  if (typeof v === 'boolean') return ['boolean'];
  if (typeof v === 'object') return ['object'];
  return ['undefined'];
}

/** PURE: JSON equality for enum and const. */
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
}

const ptr = (path, key) => `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;

/**
 * Compile a schema (or the part a local ref names) to a checking function.
 * @param {object} root the whole schema document
 * @param {string} [at] a local ref to start from, '#/$defs/street'
 * @returns {(value: any, opts?: { limit?: number }) => { path: string, keyword: string, message: string }[]}
 */
export function compileSchema(root, at = '#') {
  const compiled = new Map();

  function resolve(ref) {
    if (ref === '#') return root;
    const m = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref);
    if (!m || !root.$defs || !(m[1] in root.$defs)) throw new Error(`schema-check: unsupported or unknown $ref ${ref}`);
    return root.$defs[m[1]];
  }

  function compile(schema, where) {
    if (schema === true) return () => {};
    if (schema === false) return (v, path, out) => out.push({ path, keyword: 'false', message: 'is not allowed here' });
    if (!schema || typeof schema !== 'object') throw new Error(`schema-check: bad schema at ${where}`);
    if (compiled.has(schema)) return compiled.get(schema);
    // A ref can be cyclic: register a forwarder first.
    let impl = null;
    const fn = (v, path, out) => impl(v, path, out);
    compiled.set(schema, fn);
    for (const k of Object.keys(schema)) {
      if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k)) throw new Error(`schema-check: keyword "${k}" at ${where} is not supported`);
    }
    const checks = [];
    const s = schema;
    if (s.$ref) {
      const target = resolve(s.$ref);
      let sub = null;
      checks.push((v, path, out) => { sub ??= compile(target, s.$ref); sub(v, path, out); });
    }
    if (s.type !== undefined) {
      const want = Array.isArray(s.type) ? s.type : [s.type];
      checks.push((v, path, out) => {
        const has = jsonTypes(v);
        if (!want.some((t) => has.includes(t))) out.push({ path, keyword: 'type', message: `must be ${want.join(' or ')}` });
      });
    }
    if (s.enum) checks.push((v, path, out) => { if (!s.enum.some((e) => same(e, v))) out.push({ path, keyword: 'enum', message: `must be one of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}` }); });
    if ('const' in s) checks.push((v, path, out) => { if (!same(s.const, v)) out.push({ path, keyword: 'const', message: `must be ${JSON.stringify(s.const)}` }); });
    const num = (key, bad) => {
      if (typeof s[key] !== 'number') return;
      checks.push((v, path, out) => { if (typeof v === 'number' && bad(v, s[key])) out.push({ path, keyword: key, message: `must be ${key} ${s[key]}` }); });
    };
    num('minimum', (v, m) => v < m);
    num('maximum', (v, m) => v > m);
    num('exclusiveMinimum', (v, m) => v <= m);
    num('exclusiveMaximum', (v, m) => v >= m);
    // String lengths count code points, as JSON Schema says.
    if (typeof s.minLength === 'number') checks.push((v, path, out) => { if (typeof v === 'string' && [...v].length < s.minLength) out.push({ path, keyword: 'minLength', message: `must have at least ${s.minLength} characters` }); });
    if (typeof s.maxLength === 'number') checks.push((v, path, out) => { if (typeof v === 'string' && [...v].length > s.maxLength) out.push({ path, keyword: 'maxLength', message: `must have at most ${s.maxLength} characters` }); });
    if (typeof s.pattern === 'string') {
      const re = new RegExp(s.pattern, 'u');
      checks.push((v, path, out) => { if (typeof v === 'string' && !re.test(v)) out.push({ path, keyword: 'pattern', message: `must match ${s.pattern}` }); });
    }
    if (typeof s.minItems === 'number') checks.push((v, path, out) => { if (Array.isArray(v) && v.length < s.minItems) out.push({ path, keyword: 'minItems', message: `must have at least ${s.minItems} items` }); });
    if (typeof s.maxItems === 'number') checks.push((v, path, out) => { if (Array.isArray(v) && v.length > s.maxItems) out.push({ path, keyword: 'maxItems', message: `must have at most ${s.maxItems} items` }); });
    if (s.items !== undefined) {
      const item = compile(s.items, `${where}/items`);
      checks.push((v, path, out) => { if (Array.isArray(v)) v.forEach((x, i) => item(x, ptr(path, i), out)); });
    }
    if (Array.isArray(s.required)) {
      checks.push((v, path, out) => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return;
        for (const k of s.required) if (!Object.prototype.hasOwnProperty.call(v, k)) out.push({ path, keyword: 'required', message: `must have ${k}` });
      });
    }
    const props = s.properties ? Object.fromEntries(Object.entries(s.properties).map(([k, sub]) => [k, compile(sub, `${where}/properties/${k}`)])) : null;
    const extra = s.additionalProperties !== undefined ? compile(s.additionalProperties, `${where}/additionalProperties`) : null;
    const names = s.propertyNames !== undefined ? compile(s.propertyNames, `${where}/propertyNames`) : null;
    if (props || extra || names) {
      checks.push((v, path, out) => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return;
        for (const k of Object.keys(v)) {
          if (names) {
            const before = out.length;
            names(k, ptr(path, k), out);
            for (let i = before; i < out.length; i += 1) out[i] = { ...out[i], keyword: 'propertyNames', message: `name ${JSON.stringify(k)} ${out[i].message}` };
          }
          if (props && Object.prototype.hasOwnProperty.call(props, k)) props[k](v[k], ptr(path, k), out);
          else if (extra) {
            if (s.additionalProperties === false) out.push({ path: ptr(path, k), keyword: 'additionalProperties', message: 'is not allowed here' });
            else extra(v[k], ptr(path, k), out);
          }
        }
      });
    }
    if (Array.isArray(s.allOf)) {
      const subs = s.allOf.map((x, i) => compile(x, `${where}/allOf/${i}`));
      checks.push((v, path, out) => { for (const sub of subs) sub(v, path, out); });
    }
    if (Array.isArray(s.anyOf)) {
      const subs = s.anyOf.map((x, i) => compile(x, `${where}/anyOf/${i}`));
      checks.push((v, path, out) => {
        for (const sub of subs) {
          const tmp = [];
          sub(v, path, tmp);
          if (!tmp.length) return;
        }
        out.push({ path, keyword: 'anyOf', message: 'matches none of the allowed forms' });
      });
    }
    impl = (v, path, out) => { for (const c of checks) c(v, path, out); };
    return fn;
  }

  const top = compile(resolve(at), at);
  return (value, { limit = 50 } = {}) => {
    const out = [];
    top(value, '', out);
    return out.slice(0, limit);
  };
}
