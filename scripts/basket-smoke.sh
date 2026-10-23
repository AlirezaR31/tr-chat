#!/bin/bash
# API smoke test for the Smart Shopping Basket feature
set -u
BASE="http://localhost:3000"
SID="smoke-$(date +%s)"

post() {
  curl -s -X POST "$BASE/api/chat" -H "Content-Type: application/json" -d "$1"
}

CTX='{"priorities":["comfort","price"],"recommendedIds":[],"compareIds":[],"criteria":"comfort","stage":"greeting","storeFilters":{"sort":"price","installmentOnly":false,"openNow":false,"confirmedStockOnly":false},"contacted":{},"basket":[],"optimizeMode":"balanced","transport":"car","dismissedRecs":[],"recsMuted":false}'

echo "=== 1. search (get recommendations) ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"کتانی راحتی زیر ۴ میلیون تومان می‌خوام\"}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print('recs:', d['context']['recommendedIds'][:4], '| blocks:', [b['type'] for b in d['turn']['blocks']])"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context'], ensure_ascii=False))")

echo "=== 2. add sneaker to basket ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"این اسکچرز رو به سبد اضافه کن\"}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print('basket:', [(i['productId'],i['quantity']) for i in d['context']['basket']], '| blocks:', [b['type'] for b in d['turn']['blocks']], '| view total:', d.get('basketView',{}).get('estimatedTotal'))"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context'], ensure_ascii=False))")

echo "=== 3. add socks (accessory) ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"جوراب ورزشی رو هم به سبد اضافه کن\"}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print('basket:', [(i['productId'],i['quantity']) for i in d['context']['basket']]); recs=[b for b in d['turn']['blocks'] if b['type']=='basket_recommendations']; print('recs:', [(r['kind'], r['product']['id'], r['availability'] is not None) for r in recs[0]['recs']] if recs else 'NONE')"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context'], ensure_ascii=False))")

echo "=== 4. add insole ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"کفی طبی هم بنداز تو سبد\"}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print('basket:', [(i['productId']) for i in d['context']['basket']])"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context'], ensure_ascii=False))")

echo "=== 5. set location + plan route ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"سعادت‌آباد\"}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
blocks=[b['type'] for b in d['turn']['blocks']]
print('blocks:', blocks)
rp=[b for b in d['turn']['blocks'] if b['type']=='route_plan']
if rp:
    p=rp[0]['plan']
    print('stops:', [(s['order'], s['storeName'], s['clusterLabel'], s['etaLabel'], s['closedAtArrival']) for s in p['stops']])
    print('items per stop:', [(s['order'], [i['productId'] for i in s['items']]) for s in p['stops']])
    print('totals: cost', p['totalProductCost'], '| km', p['totalDistanceKm'], '| travel', p['totalTravelMin'], '| score', p['score'])
    print('tradeoff:', p['tradeoff'][:100])
    print('alts:', [(a['planId'], a['mode'], a['stopCount'], a['totalProductCost']) for a in p['alternatives']])
    print('unassigned:', [(u['productId'], u['reason'][:60]) for u in p['unassigned']])
    print('changes:', p['changes'])
"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context'], ensure_ascii=False))")

echo "=== 6. switch to cheapest mode ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"مسیر رو برای کمترین هزینه حساب کن\"}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
rp=[b for b in d['turn']['blocks'] if b['type']=='route_plan']
if rp:
    p=rp[0]['plan']
    print('mode:', p['mode'], '| stops:', [(s['order'], s['storeName']) for s in p['stops']], '| cost:', p['totalProductCost'])
"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context'], ensure_ascii=False))")

echo "=== 7. remove item after route ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"کفی رو از سبد حذف کن\"}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print('basket:', [i['productId'] for i in d['context']['basket']], '| blocks:', [b['type'] for b in d['turn']['blocks']])"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context'], ensure_ascii=False))")

echo "=== 8. recalc after removal ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"مسیر رو دوباره حساب کن\"}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
rp=[b for b in d['turn']['blocks'] if b['type']=='route_plan']
if rp:
    p=rp[0]['plan']
    print('stops:', [(s['order'], s['storeName'], [i['productId'] for i in s['items']]) for s in p['stops']])
"
CTX=$(echo "$R" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['context'], ensure_ascii=False))")

echo "=== 9. show basket ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"سبد خریدم رو نشون بده\"}")
echo "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
bs=[b for b in d['turn']['blocks'] if b['type']=='basket_summary']
if bs:
    b=bs[0]['basket']
    print('items:', [(i['productId'], i['assignment']['storeName'] if i['assignment'] else None, i.get('note')) for i in b['items']])
    print('total:', b['estimatedTotal'], '| savings:', b['savingsVsMax'])
"

echo "=== 10. clear basket ==="
R=$(post "{\"sessionId\":\"$SID\",\"context\":$CTX,\"message\":\"سبد رو خالی کن\"}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print('basket:', d['context']['basket'])"

echo "=== 11. remove_stop action ==="
R=$(curl -s -X POST "$BASE/api/chat/action" -H "Content-Type: application/json" -d "{\"sessionId\":\"$SID\",\"context\":$CTX,\"action\":{\"type\":\"update_context\",\"payload\":{}}}")
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); print('action endpoint ok, basketView present:', 'basketView' in d)"
echo "ALL SMOKE TESTS DONE"
