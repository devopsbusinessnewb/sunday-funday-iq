"""Private local lifecycle state and OS-released collector lock (stdlib only)."""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def state_dir():
    base = Path(os.environ.get('LOCALAPPDATA') or Path.home())
    return Path(os.environ.get('SFIQ_CBS_STATE_DIR', str(base / 'SundayFundayIQ' / 'worker-state')))


def read_status():
    try:
        data = json.loads((state_dir() / 'collector-status.json').read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_status(data):
    directory = state_dir()
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / 'collector-status.json'
    temporary = directory / ('status-' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


class CollectorBusy(RuntimeError):
    pass


class ProfileLock:
    """Lock inside the profile directory, shared by login and all collector paths."""
    def __init__(self, profile):
        self.profile = Path(profile)
        self.handle = None

    def __enter__(self):
        self.profile.mkdir(parents=True, exist_ok=True)
        self.handle = (self.profile / '.sfiq-collector.lock').open('a+b')
        self.handle.seek(0, 2)
        if self.handle.tell() == 0:
            self.handle.write(b'0')
            self.handle.flush()
        self.handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.handle.close()
            self.handle = None
            raise CollectorBusy('CBS profile is already in use by another collector or login.') from exc
        return self

    def __exit__(self, *unused):
        # Closing the handle releases the OS lock, including after process termination.
        self.handle.close()
        self.handle = None


def run_recorded(action):
    previous = read_status()
    state = {'schemaVersion': 1, 'runId': uuid.uuid4().hex,
             'startedAt': now(), 'finishedAt': None, 'outcome': 'running',
             'lastSuccessAt': previous.get('lastSuccessAt'), 'errorType': None}
    bridge_run_id = os.environ.get('SFIQ_CBS_BRIDGE_RUN_ID', '').strip().lower()
    if len(bridge_run_id) == 32 and all(char in '0123456789abcdef' for char in bridge_run_id):
        state['bridgeRunId'] = bridge_run_id
    write_status(state)
    try:
        result = action()
    except BaseException as exc:
        state.update(finishedAt=now(), outcome='failed', errorType=type(exc).__name__)
        write_status(state)
        raise
    else:
        state.update(finishedAt=now(), outcome='succeeded')
        state['lastSuccessAt'] = state['finishedAt']
        write_status(state)
        return result
