#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
COUNT="${1:-1000}"

first_names=("Alexandre" "Marie" "Jean" "Sophie" "Luc" "Camille" "Nicolas" "Isabelle" "Olivier" "Chloe" "Mathieu" "Emma" "Thomas" "Sarah" "Antoine" "Juliette" "Julien" "Alicia" "Hugo" "Mia")
last_names=("Tremblay" "Gagnon" "Roy" "Cote" "Bouchard" "Gauthier" "Morin" "Lavoie" "Fortin" "Gagne" "Ouellet" "Pelletier" "Levesque" "Bergeron" "Leblanc" "Paquette" "Girard" "Simard" "Boudreau" "Poitras")
street_types=("Rue" "Avenue" "Boulevard" "Chemin" "Place" "Crescent" "Croissant")
street_names=("Deslauriers" "Du Moulin" "Le Gardeur" "Sainte-Marie" "Saint-Laurent" "Sainte-Anne" "Des Pins" "Des Lilas" "Des Erables" "Des Cedres" "Des Champs" "Des Fleurs" "Des Peupliers" "Des Chenes" "Du Lac" "Du Parc" "Des Sorbiers" "Des Ormes" "Des Violettes" "Des Roses")

random_item() {
  local -n arr=$1
  echo "${arr[$((RANDOM % ${#arr[@]}))]}"
}

random_phone() {
  printf "514%07d" "$((RANDOM % 10000000))"
}

random_address() {
  local number=$((RANDOM % 9000 + 1))
  local type="$(random_item street_types)"
  local name="$(random_item street_names)"
  echo "${number} ${type} ${name}, Mascouche, QC"
}

for i in $(seq 1 "$COUNT"); do
  prenom="$(random_item first_names)"
  nom="$(random_item last_names)"
  email="${prenom}.${nom}.${i}@example.com"

  payload=$(cat <<JSON
{
  "nom": "${nom}",
  "prenom": "${prenom}",
  "addresse": "$(random_address)",
  "telephone": "$(random_phone)",
  "courriel": "${email}",
  "texto": $([ $((RANDOM % 2)) -eq 0 ] && echo true || echo false)
}
JSON
)

  curl -sS -X POST "$API_URL/api/patients" \
    -H "Content-Type: application/json" \
    -d "$payload" >/dev/null

  if (( i % 100 == 0 )); then
    echo "Created $i patients"
  fi

done

echo "Done. Created $COUNT patients in Mascouche."
