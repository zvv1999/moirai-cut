export function formatDate({ date }: { date: Date }): string {
	return date.toLocaleDateString("zh-CN", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
