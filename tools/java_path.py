"""The Java the art tools run FFDec under (Python side of tools/java.mjs; both read tools/java.json).

$GRODDLE_JAVA when set, else the first Homebrew JDK in java.json's order (bin/java under each
prefix), else plain `java` from the PATH. A tool in a subfolder imports it with:

    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    from java_path import JAVA  # noqa: E402

`python3 tools/java_path.py` prints the one it picks.
"""
import json
import os

CONFIG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'java.json')))


def find_java(env=None, exists=os.path.exists, config=CONFIG):
    env = os.environ if env is None else env
    chosen = str(env.get(config['env']) or '').strip()
    if chosen:
        return chosen
    for jdk in config['jdks']:
        for prefix in config['prefixes']:
            path = f'{prefix}/{jdk}/bin/java'
            if exists(path):
                return path
    return config['fallback']


JAVA = find_java()

if __name__ == '__main__':
    print(JAVA)
