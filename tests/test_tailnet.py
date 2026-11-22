from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tailnet import details


class TailnetStartupTests(unittest.TestCase):
    def test_running_without_loaded_owner_is_not_ready(self):
        state={'BackendState':'Running','Self':{'DNSName':'firearms.tailtest.ts.net.','UserID':1},'User':None}
        with patch('tailnet.status',return_value=state), self.assertRaisesRegex(RuntimeError,'still loading'):
            details()
        state['User']={'1':{'LoginName':'owner@example.test'}}
        with patch('tailnet.status',return_value=state):
            self.assertEqual(details(),('firearms.tailtest.ts.net','owner@example.test'))

    def test_name_collision_is_not_silently_accepted(self):
        state={'BackendState':'Running','Self':{'DNSName':'firearms-1.tailtest.ts.net.','UserID':1}}
        with patch('tailnet.status',return_value=state), self.assertRaisesRegex(RuntimeError,'name conflict'):
            details()
