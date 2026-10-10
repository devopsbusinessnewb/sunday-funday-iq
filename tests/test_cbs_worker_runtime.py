import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'tools' / 'cbs-worker-runtime.py'
spec = importlib.util.spec_from_file_location('runtime', MODULE)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)

BRIDGE_MODULE = Path(__file__).resolve().parents[1] / 'tools' / 'cbs-bridge-server.py'
bridge_spec = importlib.util.spec_from_file_location('bridge', BRIDGE_MODULE)
bridge = importlib.util.module_from_spec(bridge_spec)
bridge_spec.loader.exec_module(bridge)


class RuntimeTests(unittest.TestCase):
    def test_cross_process_lock_and_termination_release(self):
        with tempfile.TemporaryDirectory() as directory:
            child = "import importlib.util,sys; s=importlib.util.spec_from_file_location('r',sys.argv[1]); r=importlib.util.module_from_spec(s); s.loader.exec_module(r); lock=r.ProfileLock(sys.argv[2]); lock.__enter__(); print('locked',flush=True); sys.stdin.read()"
            process = subprocess.Popen([sys.executable, '-c', child, str(MODULE), directory], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(process.stdout.readline().strip(), 'locked')
                with self.assertRaises(runtime.CollectorBusy):
                    with runtime.ProfileLock(directory):
                        pass
            finally:
                process.terminate()
                process.wait(timeout=10)
                process.stdin.close()
                process.stdout.close()
            with runtime.ProfileLock(directory):
                pass

    def test_success_survives_reload_and_failure_preserves_it(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'SFIQ_CBS_STATE_DIR': directory}):
            with patch.dict(os.environ, {'SFIQ_CBS_BRIDGE_RUN_ID': 'a' * 32}):
                runtime.run_recorded(lambda: None)
            recorded = runtime.read_status()
            self.assertEqual(recorded['bridgeRunId'], 'a' * 32)
            success = runtime.read_status()['lastSuccessAt']
            def fail():
                raise ValueError('private credential must not be recorded')
            with self.assertRaises(ValueError):
                runtime.run_recorded(fail)
            state = json.loads((Path(directory) / 'collector-status.json').read_text())
            self.assertEqual(state['outcome'], 'failed')
            self.assertEqual(state['lastSuccessAt'], success)
            self.assertEqual(state['errorType'], 'ValueError')
            self.assertNotIn('credential', json.dumps(state))

    def test_bridge_recovers_completed_job_after_restart(self):
        durable = {
            'bridgeRunId': 'b' * 32,
            'startedAt': '2026-10-10T05:24:40Z',
            'finishedAt': '2026-10-10T05:25:04Z',
            'outcome': 'succeeded',
            'lastSuccessAt': '2026-10-10T05:25:04Z',
        }
        initial = {
            'refreshing': False, 'currentRunId': None, 'lastCompletedRunId': None,
            'lastRefreshStarted': None, 'lastRefreshFinished': None,
            'lastRefreshOk': None, 'lastRefreshError': None,
            'lastPublishedAt': None, 'lastCommit': None,
        }
        with patch.dict(bridge.SERVICE, initial, clear=True), patch.object(bridge.runtime, 'read_status', return_value=durable):
            status, collector = bridge.snapshot_status()
        self.assertEqual(status['lastCompletedRunId'], 'b' * 32)
        self.assertTrue(status['lastRefreshOk'])
        self.assertEqual(status['lastRefreshFinished'], durable['finishedAt'])
        self.assertEqual(collector, durable)

    def test_bridge_passes_job_id_to_collector(self):
        result = type('Result', (), {'returncode': 0, 'stderr': '', 'stdout': ''})()
        with patch.object(bridge.subprocess, 'run', return_value=result) as run:
            self.assertTrue(bridge.run_collector('c' * 32, claimed=True))
        self.assertEqual(run.call_args.kwargs['env']['SFIQ_CBS_BRIDGE_RUN_ID'], 'c' * 32)

    def test_corrupt_status_is_unknown(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'SFIQ_CBS_STATE_DIR': directory}):
            (Path(directory) / 'collector-status.json').write_text('broken')
            self.assertEqual(runtime.read_status(), {})


if __name__ == '__main__':
    unittest.main()
