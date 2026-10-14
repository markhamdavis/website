#!/usr/bin/env python3
"""Rebuild data.js from a Brokers Alliance comp grid .docx export.

Usage: python3 tools/build_data.py BA_Comp_Grid.docx data.js
"""
import sys, zipfile, re, json
from xml.etree import ElementTree as ET

def terms(prod, det):
    t=(prod+' ; '+det).lower().replace('–','-').replace('—','-')
    t=re.sub(r'(issue\s+)?ages?\s*:?\s*\d+\s*(\+|\s*-\s*(\d+|lifetime))?','',t)
    t=re.sub(r'to age \d+','',t)
    t=re.sub(r'series \d+|\(\d{4}\)|\b\d{4}\b|\$[\d,]+( to [\d,]+)?|level \d+|\bl\d+\b','',t)
    out=set()
    for a,b in re.findall(r'\b(\d{1,2})\s*-\s*(\d{1,2})\b',t):
        a,b=int(a),int(b)
        if a<b<=40 and a>=5: out.update(range(a,b+1))
        t=t.replace(f'{a}-{b}',' ',1) if a<b<=40 and a>=5 else t
    for n in re.findall(r'(?<![\d.])(\d{1,2})(?![\d.%])',t):
        n=int(n)
        if 5<=n<=40: out.add(n)
    return sorted(out)

def parse(docx):
    W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    z=zipfile.ZipFile(docx); body=ET.fromstring(z.read('word/document.xml')).find(W+'body')
    txt=lambda e:re.sub(r'\s+',' ',''.join(t.text or '' for t in e.iter(W+'t'))).strip()
    section=None; carrier=None; rows=[]
    for el in body:
        tag=el.tag[len(W):]
        if tag=='p':
            t=txt(el)
            if not t: continue
            if t in('Life','Annuity','Health','Disability','LTC','Medicare'): section=t; continue
            if ':' in t or t.startswith('Brokers Alliance'): continue
            carrier=t
        elif tag=='tbl' and section=='Life':
            trs=el.findall(W+'tr'); hdr=[txt(c) for c in trs[0].findall(W+'tc')]
            idx={h:i for i,h in enumerate(hdr)}
            last=None
            for tr in trs[1:]:
                c=[txt(x) for x in tr.findall(W+'tc')]
                g=lambda k:c[idx[k]] if k in idx and idx[k]<len(c) else ''
                prod,det,comp=g('Product'),g('Criteria / Details'),g('Comp %')
                m=re.match(r'(.*):\s*([\d.]*)\s*%\s*$',comp)
                if not m or not m.group(2): continue
                low=(prod+' '+det).lower()
                if re.search(r'renewal year|excess year|service fee|^years? \d|\byears? \d+\s*[-–]',low) or re.match(r'years? \d',prod.lower()): continue
                if re.search(r'renewal year: 2|excess',det.lower()): continue
                rows.append(dict(c=carrier,p=prod,t=g('Type'),d=det,s=g('States'),l=m.group(1).strip(),r=float(m.group(2))))
    return rows

def main(docx, out_path):
    rows = parse(docx)
    for r in rows:
        r['y'] = terms(r['p'], r['d'])
    out = [[r['c'], r['p'], r['d'], r['s'], r['l'], r['r'], r['y'], r['t']] for r in rows]
    with open(out_path, 'w') as f:
        f.write('// Generated from the Brokers Alliance comp grid by tools/build_data.py.\n')
        f.write('// Life section, first-year comp only. CONFIDENTIAL - do not publish.\n')
        f.write('// Row format: [carrierGrid, product, details, states, contractLevel, compPercent, termYears[], type]\n')
        f.write('var MODUS_GRID = ')
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print(f'{len(rows)} product lines from {len({r["c"] for r in rows})} carrier grids -> {out_path}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
