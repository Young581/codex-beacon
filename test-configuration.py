import unittest
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path

spec = spec_from_file_location('configure', Path(__file__).with_name('configure-notifications.py'))
configure = module_from_spec(spec)
spec.loader.exec_module(configure)


class ConfigurationTests(unittest.TestCase):
    def test_preserves_comments_nested_values_and_trailing_commas(self):
        source = '{\n// keep comment\n"other": {"text":"} // /*", "arr":[1,2,],},\n"alert": false, /* keep */\n}\n'
        result = configure.update(source, {'alert': True, 'new': '中文'})
        self.assertIn('// keep comment', result)
        self.assertIn('/* keep */', result)
        self.assertIn('"other": {"text":"} // /*", "arr":[1,2,],}', result)
        self.assertIn('"alert": true', result)
        self.assertIn('"new": "中文"', result)
        self.assertEqual(configure.update(result, {'alert': True, 'new': '中文'}), result)

    def test_empty_objects_and_comment_at_end(self):
        for source in ('{}', '{ /* comment */ }', '{"other":1 // comment\n}'): 
            result = configure.update(source, {'alert': True})
            configure.tokens(result)
            self.assertIn('"alert": true', result)

    def test_replaces_nested_value_and_duplicate_keys(self):
        result = configure.update('{"alert": {"old": [1,2]}, "alert":false}', {'alert': True})
        self.assertEqual(result.count('true'), 2)

    def test_invalid_input_is_rejected(self):
        for source in ('[]', '{"x":unknown}', '{"x": 1', '{"x":1} unexpected'):
            with self.assertRaises((ValueError, IndexError)):
                configure.update(source, {'alert': True})


if __name__ == '__main__':
    unittest.main()
