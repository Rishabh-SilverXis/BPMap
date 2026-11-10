"""Independent oracle: reads a Workday BP export with Python's stdlib only (zipfile + ElementTree),
re-implementing the rules from scratch so our TypeScript importer is checked, not trusted."""
import sys, json, re, zipfile, html
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
z = zipfile.ZipFile(sys.argv[1])
shared = []
if 'xl/sharedStrings.xml' in z.namelist():
    for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
        shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
wb = ET.fromstring(z.read('xl/workbook.xml'))
rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}

def col(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0): n = n * 26 + ord(ch) - 64
    return n - 1

def sheet_rows(name):
    for s in wb.find('m:sheets', NS):
        if s.get('name') == name:
            target = rels[s.get('{%s}id' % NS['r'])].lstrip('/').replace('xl/', '')
            root = ET.fromstring(z.read('xl/' + target))
            rows = []
            for row in root.iter('{%s}row' % NS['m']):
                cells = {}
                for c in row.findall('m:c', NS):
                    v = c.find('m:v', NS); t = c.get('t')
                    if t == 's': val = shared[int(v.text)]
                    elif t == 'inlineStr': val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
                    else: val = v.text if v is not None else ''
                    cells[col(c.get('r'))] = val or ''
                rows.append([cells.get(i, '') for i in range(max(cells) + 1)] if cells else [])
            return rows
    return []

def decode(s): return html.unescape(s.replace('&#xa;', '\n').replace('&#xA;', '\n'))
def lines(s): return [re.sub(r'\s+', ' ', x).strip() for x in decode(s).split('\n') if x.strip()]

rows = sheet_rows('Business Process Steps')
h = next(i for i, r in enumerate(rows) if 'Order' in r and 'Type' in r)
H = rows[h]; ix = {name: H.index(name) for name in H if name}
WD = re.compile(r'\s*\(Workday Owned\)\s*$', re.I)
steps, conds = [], {}
for r in rows[h + 1:]:
    g = lambda k: (r[ix[k]] if ix.get(k) is not None and ix[k] < len(r) else '')
    if not g('Order').strip(): continue
    cl = [(WD.sub('', c).strip(), bool(WD.search(c))) for c in lines(g('If'))]
    for text, owned in cl:
        key = text.lower()
        conds.setdefault(key, {'text': text, 'workdayOwned': False, 'steps': []})
        conds[key]['workdayOwned'] |= owned
        conds[key]['steps'].append(g('Order').strip())
    grp = lines(g('Group'))
    typ = g('Type').strip()
    lane = grp[0] if grp else ('Initiator' if typ == 'Initiation' else 'Workday (automatic)')
    info = lines(g('Additional Information'))
    steps.append({'order': g('Order').strip(), 'type': typ, 'specify': g('Specify').strip(), 'lane': lane, 'groups': grp,
                  'conditions': [c[0] for c in cl], 'complete': g('Complete').strip().lower() == 'yes',
                  'restriction': next((x.split(':', 1)[1].strip() for x in info if x.lower().startswith('restriction')), None),
                  'alternate': next((x.split(':', 1)[1].strip() for x in info if x.lower().startswith('alternate')), None),
                  'routing': g('Routing Modifier').strip() or None, 'validations': len(lines(g('Validation')))})
lanes = []
for s in steps:
    if s['lane'] not in lanes: lanes.append(s['lane'])
notif = sheet_rows('Notifications')
sysh = next(i for i, r in enumerate(notif) if r[:1] == ['System Notifications'])
cush = next(i for i, r in enumerate(notif) if r[:1] == ['Custom Notifications'])
out = {
    'rowOrder': [s['order'] for s in steps],
    'steps': steps,
    'conditions': list(conds.values()),
    'lanes': lanes,
    'groups': sorted({g for s in steps for g in s['groups']}),
    'conditionalSteps': sum(1 for s in steps if s['conditions']),
    'completeSteps': [s['order'] for s in steps if s['complete']],
    'notifications': {'system': cush - sysh - 2, 'custom': len([r for r in notif[cush + 2:] if any(c.strip() for c in r)])},
    'initiatingGroups': lines(next(r for r in rows[:h] if r[:1] == ['Initiating Security Groups'])[1]),
}
print(json.dumps(out, indent=1))
