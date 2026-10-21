VM = lambda n=16: f'<svg class="vm" width="{n}" height="{n}" viewBox="0 0 24 24" aria-hidden="true"><rect class="vm-t" width="24" height="24" rx="6" fill="var(--ink)"/><path class="vm-p" d="M5 12h10" stroke="var(--surface)" stroke-width="2.2" stroke-linecap="round"/><path class="vm-a" d="M19.5 12 14 8v8z" fill="var(--surface)"/><path class="vm-p" d="M5 8.5 7.5 12 5 15.5" stroke="var(--surface)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
FACE = {'rudo':'a61b8dfcc034758dfb81f13a105f61e9','kuda':'e7e012736e184b768be5e95bbda848fc','precious':'ed739be2d725b178f8e5b3b2ca0eb224','tinashe':'722541ad1bbcd1094ec76f6b5a2209df'}
def face(who, cls='face-20'):
    return f'<img class="face {cls}" src="/_blob/{FACE[who]}" alt="">'
def page(title, body, w, h, extra_css='', theme='corelith'):
    return f'''<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/corelith-workspace/components/bundle.css">
<link rel="stylesheet" href="icons.css">
<link rel="stylesheet" href="teams.css">
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap">
<style>body{{margin:0;background:#ffffff}}
{extra_css}
</style>
</helmet>
<div class="cx" data-theme="{theme}" style="width: {w}px; min-height: {h}px; box-sizing: border-box; background: var(--surface); position: relative">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''
