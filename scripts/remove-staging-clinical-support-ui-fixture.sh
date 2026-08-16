#!/usr/bin/env bash
set -euo pipefail

MARKER="${1:-}"
[[ "$MARKER" =~ ^clinical-support-ui-[0-9]+-[0-9]+$ ]] || {
  echo "Usage : $0 clinical-support-ui-<timestamp>-<suffixe>" >&2
  exit 1
}

docker compose -p clinia_mongo_rs -f docker-compose-mongo-rs-local.yml \
  exec -T -e MARKER="$MARKER" mongo-rs-1 sh -c '
    mongosh --quiet --username "$CLINIA_RS_ROOT_USERNAME" --password="$CLINIA_RS_ROOT_PASSWORD" --authenticationDatabase admin --eval "
      const dbx=db.getSiblingDB(\"clinia\");
      const doctor=dbx.adminusers.findOne({username:process.env.MARKER,role:\"MEDECIN\"},{_id:1});
      if (!doctor) { print(\"Aucune donnée de test correspondante.\"); quit(0); }
      const patientIds=dbx.patients.find({ownerUserId:doctor._id},{_id:1}).toArray().map(row=>row._id);
      dbx.clinicalsupportaccessrequests.deleteMany({physicianUserId:doctor._id});
      dbx.refreshtokensessions.deleteMany({userId:doctor._id});
      if (patientIds.length) dbx.patients.deleteMany({_id:{\$in:patientIds}});
      dbx.adminusers.deleteOne({_id:doctor._id});
      print(\"Données STAGING fictives supprimées.\");
    "
  '
