import os,sys,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tests/integration'))
import test_api
fixture=test_api.ApiTests();fixture.setUp()
try:
 result=subprocess.run(['k6','run','--summary-export','docs/verification/k6-summary.json','tests/load/graphql.js'],env={**os.environ,'ACCESS_TOKEN':fixture.a['token']})
 raise SystemExit(result.returncode)
finally:fixture.tearDown()
