import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'Migration to dev account/deployments/glab-backups'))
from database_export import load_policy,archive_lines
from schema_capture import dump_args

class AccessBackupTests(unittest.TestCase):
    def test_opt_in_covers_all_seven_tables_and_private_schema(self):
        with patch.dict('os.environ',{'LANDDRAFT_SITE_ACCESS_BACKUP':'true'}):
            policy=load_policy()
            self.assertEqual(7,sum(t.startswith('landdraft_control.') for t in policy['tables']))
            self.assertIn('--schema=landdraft_control',dump_args('pg_dump'))
            lines=[json.dumps({'kind':'catalog','data':policy['catalog'],'auth_state_empty':True}).encode(),json.dumps({'kind':'end'}).encode()]
            self.assertTrue(archive_lines(lines,policy))
            damaged={**policy,'catalog':[r for r in policy['catalog'] if r['schema_name']!='landdraft_control']}
            with self.assertRaisesRegex(ValueError,'Schema drift'):archive_lines(lines,damaged)

    def test_existing_workflow_stays_unchanged_until_opt_in(self):
        with patch.dict('os.environ',{'LANDDRAFT_SITE_ACCESS_BACKUP':'false'}):
            self.assertFalse(any(t.startswith('landdraft_control.') for t in load_policy()['tables']))
            self.assertNotIn('--schema=landdraft_control',dump_args('pg_dump'))

if __name__=='__main__':unittest.main()
