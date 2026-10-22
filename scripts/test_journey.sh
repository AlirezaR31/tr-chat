#!/bin/bash
# E2E API test of the complete shopping journey
set -e
BASE="http://localhost:3000"
S="test-session-$(date +%s)"
CTX='{"priorities":["comfort","price"],"recommendedIds":[],"compareIds":[],"criteria":"comfort","stage":"greeting","storeFilters":{"sort":"price","installmentOnly":false,"openNow":false,"confirmedStockOnly":false},"contacted":{}}'

echo "=== 1) initial search ==="
R=$(curl -s -X POST $BASE/api/chat -H 'Content-Type: application/json' -d "{\"sessionId\":\"$S\",\"message\":\"می‌خوام یه کتانی راحتی زیر ۴ میلیون تومان که حضوری در تهران بتونم بخرم\",\"context\":$CTX}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=d['context']
print('stage:',c['stage'],'| budget:',c['budgetMax'],'| recs:',len(c['recommendedIds']))
for b in d['turn']['blocks']:
    print(' -',b['type'], (b.get('products') and [p['id'] for p in b['products']]) or '')
"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context']))")

echo "=== 2) compare top 3 ==="
CTX=$(echo "$CTX" | python3 -c "
import json,sys
c=json.load(sys.stdin)
c['compareIds']=c['recommendedIds'][:3]
print(json.dumps(c))
")
R=$(curl -s -X POST $BASE/api/chat -H 'Content-Type: application/json' -d "{\"sessionId\":\"$S\",\"message\":\"مقایسه‌شون کن\",\"context\":$CTX}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('text:', d['turn'].get('text','')[:90])
for b in d['turn']['blocks']:
    if b['type']=='comparison_panel':
        print(' entries:', [(e['name'][:18], e['scores']) for e in b['comparison']['entries']])
        print(' winnerBy:', b['comparison']['winnerBy'])
"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context']))")

echo "=== 3) select product + find stores (location set) ==="
CTX=$(echo "$CTX" | python3 -c "
import json,sys
c=json.load(sys.stdin)
c['selectedProductId']=c['recommendedIds'][0]
c['location']={'name':'سعادت‌آباد','lat':35.7797,'lng':51.3746,'source':'neighborhood'}
print(json.dumps(c))
")
R=$(curl -s -X POST $BASE/api/chat -H 'Content-Type: application/json' -d "{\"sessionId\":\"$S\",\"message\":\"کجا حضوری بخرمش؟\",\"context\":$CTX}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for b in d['turn']['blocks']:
    if b['type']=='store_panel':
        print(' stores:', len(b['stores']))
        for s in b['stores'][:4]:
            print('  -', s['name'], s['price'], s['stock']['status'], round(s['distanceKm'],1),'km', 'open' if s['openNow'] else 'closed', 'installment' if s['installment']['verified'] else '')
"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context']))")

echo "=== 4) contact a no_answer store ==="
R=$(curl -s -X POST $BASE/api/chat/action -H 'Content-Type: application/json' -d "{\"sessionId\":\"$S\",\"context\":$CTX,\"action\":{\"type\":\"contact_store\",\"payload\":{\"storeId\":\"kafsh-donyaye-varzeshi-vanak\",\"productId\":\"$(echo "$CTX" | python3 -c "import json,sys; print(json.load(sys.stdin)['selectedProductId'])")\"}}}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for b in d['turn']['blocks']:
    if b['type']=='contact_status': print(' contact:', b['storeName'], '->', b['outcome']['kind'])
    if b['type']=='alternative_stores': print(' alternatives:', [s['name'] for s in b['stores']])
"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context']))")

echo "=== 5) installment filter ==="
R=$(curl -s -X POST $BASE/api/chat -H 'Content-Type: application/json' -d "{\"sessionId\":\"$S\",\"message\":\"فقط فروشگاه‌های اقساطی رو نشون بده\",\"context\":$CTX}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('text:', d['turn'].get('text','')[:80])
c=d['context']
print('installmentOnly:', c['storeFilters']['installmentOnly'])
for b in d['turn']['blocks']:
    if b['type']=='store_panel':
        print(' stores:', [ (s['name'], s['installment']['verified']) for s in b['stores'] ])
"
echo "=== 6) empty budget ==="
R=$(curl -s -X POST $BASE/api/chat -H 'Content-Type: application/json' -d "{\"sessionId\":\"$S\",\"message\":\"کتانی زیر ۳۰۰ هزار تومان\",\"context\":$CTX}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for b in d['turn']['blocks']:
    if b['type']=='empty_state': print(' empty:', b['title'])
"
echo "ALL_API_TESTS_DONE"
