// Raw values the design tokens leave in place, read by tools/tokens/convert.mjs (it skips them) and by
// tests/design-tokens.test.js (it allows them). Each entry is matched by file, a selector pattern and
// the exact literal; keep the list short and say why each one must stay raw. Mask images are not
// checked at all: only their alpha counts, never their colour.
export const RAW_ALLOWED = [
  {
    file: 'public/style.css',
    selector: /\.skill-study-card\.unlearning \.skill-study-bar i/,
    values: ['#4d9899', '#4e989a', '#75c1c2', '#42a5a8'],
    why: "The client's teal unlearning bar (ImaginationSkillsUI.as 208-211), pinned by tests/skill-learn-labels.test.js.",
  },
  {
    file: 'public/style.css',
    selector: /\.quest-log-body \.(q-bar\.)?skill-study-bar/,
    values: ['#cfd0d0', '#b6b7b7', '5px', '#9db52e', '#879f08', '#afca2f', '#95b101', '#b38b00', '#9a7802', '#f5e242', '#d79305'],
    why: "The client's ProgressBar frame, corner and learn / fast fills (ProgressBar.as 91-100, 270-290), pinned by tests/skill-learn-labels.test.js.",
  },
];

export function allowed(file, selector, literal) {
  const v = literal.toLowerCase();
  return RAW_ALLOWED.some((e) => e.file === file && e.selector.test(selector) && e.values.includes(v));
}
