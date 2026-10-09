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
            runtime.run_recorded(lambda: None)
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

    def test_corrupt_status_is_unknown(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'SFIQ_CBS_STATE_DIR': directory}):
            (Path(directory) / 'collector-status.json').write_text('broken')
            self.assertEqual(runtime.read_status(), {})


if __name__ == '__main__':
    unittest.main()
