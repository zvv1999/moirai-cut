import { OcDataBuddyIcon, OcMarbleIcon } from "@/components/icons";

export type ExternalTool = {
	name: string;
	description: string;
	url: string;
	icon: React.ElementType;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [
	{
		name: "Marble",
		description: "Modern headless CMS used by the upstream project",
		url: "https://marblecms.com?utm_source=opencut",
		icon: OcMarbleIcon,
	},
	{
		name: "Databuddy",
		description: "Privacy-conscious analytics used by the upstream project",
		url: "https://databuddy.cc?utm_source=opencut",
		icon: OcDataBuddyIcon,
	},
];
