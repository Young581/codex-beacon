"""Enable completion alerts while preserving VS Code JSONC comments and other settings."""
import argparse
import datetime
import json
from pathlib import Path
import re
import shutil
import sys

TOKEN = re.compile(r'\s+|//[^\r\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|[{}\[\],:]|true\b|false\b|null\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?')


def tokens(text):
    result = []
    end = 0
    for match in TOKEN.finditer(text):
        if match.start() != end:
            raise ValueError('Invalid JSONC; settings were not changed')
        end = match.end()
        value = match.group()
        if not value.isspace() and not value.startswith(('//', '/*')):
            result.append((value, match.start(), match.end()))
    if end != len(text):
        raise ValueError('Invalid JSONC; settings were not changed')
    clean = [t[0] for i, t in enumerate(result)
             if not (t[0] == ',' and i + 1 < len(result) and result[i + 1][0] in ('}', ']'))]
    if not isinstance(json.loads(''.join(clean)), dict):
        raise ValueError('Settings must be a JSON object')
    return result


def update(text, values):
    items = tokens(text)
    edits = []
    pending = dict(values)
    index = 1
    while index < len(items) - 1:
        if items[index][0] == ',':
            index += 1
            continue
        key = json.loads(items[index][0])
        if items[index + 1][0] != ':':
            raise ValueError('Invalid settings property')
        start = index + 2
        finish = start + 1
        if items[start][0] in ('{', '['):
            depth = 1
            while depth:
                value = items[finish][0]
                depth += (value in ('{', '[')) - (value in ('}', ']'))
                finish += 1
        if key in values:
            edits.append((items[start][1], items[finish - 1][2], json.dumps(values[key], ensure_ascii=False)))
            pending.pop(key, None)
        index = finish
    if pending:
        if len(items) > 2 and items[-2][0] != ',':
            edits.append((items[-2][2], items[-2][2], ','))
        entries = ',\n'.join('    ' + json.dumps(key) + ': ' + json.dumps(value, ensure_ascii=False)
                            for key, value in pending.items())
        edits.append((items[-1][1], items[-1][1], '\n' + entries + '\n'))
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    tokens(text)
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', required=True, type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    values = {
        'codexBeacon.notificationsEnabled': True,
        'codexBeacon.notifyOnDone': True,
        'codexBeacon.desktopNotifications': True,
        'codexBeacon.desktopOnDone': True,
        'codexBeacon.sound': True,
        'codexBeacon.soundOnDone': True,
        'codexBeacon.onlyWhenUnfocused': False,
        'codexBeacon.localPythonPath': sys.executable,
        'codexBeacon.language': 'zh-CN',
    }
    original = args.settings.read_text(encoding='utf-8-sig') if args.settings.exists() else '{}\n'
    updated = update(original, values)
    if args.check:
        print('Settings can be safely updated; no files changed.')
        return
    if updated == original:
        print('Completion popup and sound settings are already configured.')
        return
    args.settings.parent.mkdir(parents=True, exist_ok=True)
    if args.settings.exists():
        backup = args.settings.with_name('settings.before-codex-beacon-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json')
        shutil.copy2(args.settings, backup)
        print('Backup: ' + str(backup))
    args.settings.write_text(updated, encoding='utf-8')
    print('Enabled completion popups and sounds; configured the available Python runtime.')


if __name__ == '__main__':
    main()
