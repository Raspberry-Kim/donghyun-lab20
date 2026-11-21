"""동현페 게임 화면 자료 묶기: pe/ 폴더의 core.js·data.js·atlas.js·game.js·apu.js를 만든다.
  python3 engine/pack.py [gen 폴더]
gen 폴더에는 원작 롬에서 만든 code.js(옮긴 프로그램)와 data.js(자료 꾸러미)가 있어야 한다.
그 둘을 만드는 도구와 롬 파일, gen 폴더는 이 저장소에 넣지 않았다. pe/ 폴더에 이미 만든 결과가 들어 있다."""
import base64, json, os, sys
H = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(H, '..', 'pe')
G = sys.argv[1] if len(sys.argv) > 1 else os.path.join(H, 'gen')
rd = lambda p: open(p, encoding='utf-8').read()
tpl, code = rd(H + '/src/core.tpl.js'), rd(G + '/code.js')
assert '/*@@CODE@@*/' in tpl
open(P + '/core.js', 'w', encoding='utf-8').write(tpl.replace('/*@@CODE@@*/', code))
open(P + '/data.js', 'w', encoding='utf-8').write(rd(G + '/data.js'))
for n in ('game.js', 'apu.js'): open(P + '/' + n, 'w', encoding='utf-8').write(rd(H + '/src/' + n))
atlas = dict(png='data:image/png;base64,' + base64.b64encode(open(H + '/assets/amolang_atlas.png', 'rb').read()).decode(), meta=json.load(open(H + '/assets/amolang_atlas.json')))
open(P + '/atlas.js', 'w', encoding='utf-8').write('window.__PE_ATLAS=' + json.dumps(atlas, separators=(',', ':')) + ';\n')
print({n: os.path.getsize(P + '/' + n) for n in sorted(os.listdir(P))})
