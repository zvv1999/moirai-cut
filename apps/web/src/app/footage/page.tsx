import { FootageLibrary } from "@/footage/library";

export default async function FootagePage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const value = (key: string) =>
		typeof params[key] === "string" ? params[key] : "";
	const shot = value("shot");
	const tab = value("tab");
	return (
		<FootageLibrary
			initialView={{
				tab: shot
					? "shots"
					: ["sources", "shots", "jobs"].includes(tab)
						? tab
						: "shots",
				selected: shot || null,
				query: value("q"),
				status: value("status"),
				role: value("role"),
			}}
		/>
	);
}
