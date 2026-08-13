#!/bin/sh
set -eu

image="moirai-cut-interchange-smoke:${GITHUB_RUN_ID:-local}"
container="moirai-cut-interchange-smoke-${GITHUB_RUN_ID:-local}-$$"
project_root="$(mktemp -d)"
response="$(mktemp)"
xml="$(mktemp)"
report="$(mktemp)"

cleanup() {
	docker rm -f "$container" >/dev/null 2>&1 || true
	docker image rm -f "$image" >/dev/null 2>&1 || true
	rm -rf "$project_root"
	rm -f "$response" "$xml" "$report"
}
trap cleanup EXIT INT TERM

mkdir -p "$project_root/ci-interchange/media"
cp tests/fixtures/interchange-http-smoke/project.json \
	"$project_root/ci-interchange/project.json"
cp tests/fixtures/interchange-http-smoke/media/index.json \
	"$project_root/ci-interchange/media/index.json"
# mktemp creates a 0700 root. The production image intentionally runs as an
# unprivileged uid, so grant it access to this isolated CI fixture.
chmod -R a+rwX "$project_root"

docker build --file apps/web/Dockerfile --tag "$image" .
docker run --detach --name "$container" \
	--publish 127.0.0.1::3000 \
	--env OPENCUT_PROJECTS_DIR=/data/projects \
	--volume "$project_root:/data/projects" \
	"$image" >/dev/null

port="$(docker port "$container" 3000/tcp | sed -n 's/.*://p' | head -n 1)"
if [ -z "$port" ]; then
	echo "Docker did not publish the web port" >&2
	exit 1
fi

attempt=0
until curl --fail --silent --show-error "http://127.0.0.1:$port/api/health" >/dev/null; do
	attempt=$((attempt + 1))
	if [ "$attempt" -ge 60 ]; then
		docker logs "$container" >&2
		exit 1
	fi
	sleep 2
done

curl --fail --silent --show-error \
	--header 'content-type: application/json' \
	--data '{"baseRevision":7,"name":"ci-handoff"}' \
	"http://127.0.0.1:$port/api/interchange/ci-interchange/fcpxml" \
	--output "$response"

xml_url="$(bun -e 'const value = await Bun.file(process.argv[1]).json(); if (!value.data?.downloadUrl) process.exit(1); process.stdout.write(value.data.downloadUrl)' "$response")"
report_url="$(bun -e 'const value = await Bun.file(process.argv[1]).json(); if (!value.data?.reportDownloadUrl) process.exit(1); process.stdout.write(value.data.reportDownloadUrl)' "$response")"

curl --fail --silent --show-error "http://127.0.0.1:$port$xml_url" --output "$xml"
curl --fail --silent --show-error "http://127.0.0.1:$port$report_url" --output "$report"

bun -e '
	const response = await Bun.file(process.argv[1]).json();
	const xml = await Bun.file(process.argv[2]).text();
	const report = await Bun.file(process.argv[3]).json();
	if (!response.data?.stable || response.data.revision !== 7) process.exit(1);
	if (!xml.includes("<fcpxml version=\"1.10\">")) process.exit(1);
	if (report.schema !== "moirai-cut.interchange-report.v1") process.exit(1);
	if (report.source?.revision !== 7) process.exit(1);
' "$response" "$xml" "$report"

test -f "$project_root/ci-interchange/exports/ci-handoff-r7.fcpxml"
test -f "$project_root/ci-interchange/exports/ci-handoff-r7.interchange-report.json"
