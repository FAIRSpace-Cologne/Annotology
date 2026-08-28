# curl 'http://localhost:5000/api/annotate-term' \
#   -X POST \
#   -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0' \
#   -H 'Accept: application/json, text/plain, */*' \
#   -H 'Accept-Language: en-US,en;q=0.5' \
#   -H 'Accept-Encoding: gzip, deflate, br, zstd' \
#   -H 'Content-Type: application/json' \
#   -H 'Origin: http://localhost:3000' \
#   -H 'Connection: keep-alive' \
#   -H 'Referer: http://localhost:3000/' \
#   -H 'Sec-Fetch-Dest: empty' \
#   -H 'Sec-Fetch-Mode: cors' \
#   -H 'Sec-Fetch-Site: same-site' \
#   -H 'DNT: 1' \
#   -H 'Sec-GPC: 1' \
#   -H 'Priority: u=0' \
#   -H 'Pragma: no-cache' \
#   -H 'Cache-Control: no-cache' \
#   --data-raw '{"term":"Single-cell RNA seq (scRNA-Seq)","target_ontology":"efo","mapper":"levenshtein","min_score":0.3,"max_mappings":5}'
# API key from environment
curl -X POST http://localhost:5000/api/annotate-term \
  -H "Content-Type: application/json" \
  -d '{
    "term": "asthma",
    "mapper": "bioportal",
    "target_ontology": "EFO,MONDO",
    "max_mappings": 5
  }'
