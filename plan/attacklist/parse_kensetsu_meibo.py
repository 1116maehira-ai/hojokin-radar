import re, json, collections
TYPES = "土 建 大 左 と 石 屋 電 管 タ 鋼 筋 舗 し 板 ガ 塗 防 内 機 絶 通 園 井 具 水 消 清 解".split()
pat = re.compile(
 r'^\s*(?P<num>\d{8,9})\s+(?P<kubun>知事|大臣)\s+(?P<name>.+?)\s{2,}(?P<ceo>\S+(?: \S+){0,2})\s+(?P<zip>\d{7})\s+'
 r'(?P<city>沖縄県\S+)\s+(?P<addr>.*?)\s{2,}(?P<phone>0\d{1,4}-\d{1,4}-\d{3,4})?\s*(?P<cap>[\d,]+)?\s+(?P<ent>[12])\s+'
 r'(?P<flags>(?:[012]\s+){29})(?P<dates>(?:[HRS]\d{6}\s*)*)\s*$')
rows, bad = [], []
for line in open('meibo.txt', encoding='utf-8'):
    if not re.match(r'^\s*\d{8,9}\s+(知事|大臣)', line): continue
    m = pat.match(line.rstrip('\n'))
    if not m: bad.append(line.rstrip()); continue
    d = m.groupdict()
    flags = d['flags'].split()
    lic = [t for t,f in zip(TYPES, flags) if f in ('1','2')]
    toku = any(f=='2' for f in flags)
    rows.append({
        'num': d['num'], 'kubun': d['kubun'], 'name': d['name'].strip(), 'ceo': d['ceo'].strip(),
        'zip': d['zip'][:3]+'-'+d['zip'][3:], 'city': d['city'].replace('沖縄県',''),
        'addr': d['addr'].strip(), 'phone': d['phone'] or '', 'cap_k': int(d['cap'].replace(',','')) if d['cap'] else None,
        'entity': '法人' if d['ent']=='1' else '個人', 'types': ''.join(lic), 'tokutei': toku,
        'dates': d['dates'].split(),
    })
json.dump(rows, open('meibo.json','w',encoding='utf-8'), ensure_ascii=False)
print('parsed', len(rows), 'bad', len(bad))
for b in bad[:8]: print('BAD:', b[:160])
c = collections.Counter(r['city'] for r in rows); print('cities', c.most_common(25))
print('法人', sum(r['entity']=='法人' for r in rows), '個人', sum(r['entity']=='個人' for r in rows))
print('with phone', sum(bool(r['phone']) for r in rows))
caps=[r['cap_k'] for r in rows if r['cap_k']]; 
import statistics; print('cap>=10000k', sum(c>=10000 for c in caps), 'cap>=20000k', sum(c>=20000 for c in caps), 'cap>=50000k', sum(c>=50000 for c in caps))
nums=sorted(int(r['num']) for r in rows if r['kubun']=='知事'); print('知事 num min/max', nums[0], nums[-1], 'n', len(nums))
print('大臣', sum(r['kubun']=='大臣' for r in rows))
