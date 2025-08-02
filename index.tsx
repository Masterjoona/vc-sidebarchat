/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Channel, Guild, User } from "@vencord/discord-types";
import {
    DefaultExtractAndLoadChunksRegex,
    extractAndLoadChunksLazy,
    filters,
    findByPropsLazy,
    findComponentByCodeLazy,
    findLazy,
    findStoreLazy,
    mapMangledModuleLazy,
} from "@webpack";
import {
    ChannelRouter,
    ChannelStore,
    FluxDispatcher,
    GuildStore,
    Menu,
    MessageActions,
    MessageStore,
    PermissionsBits,
    PermissionStore,
    PopoutActions,
    RelationshipStore,
    SelectedChannelStore,
    SelectedGuildStore,
    useCallback,
    useEffect,
    useLayoutEffect,
    UserStore,
    useState,
    useStateFromStores,
} from "@webpack/common";

import { settings, SidebarStore } from "./store";

// ??? no clue why this HeaderBarIcon doesnt work, its the same as the one below
const { HeaderBar, /* HeaderBarIcon*/ } = mapMangledModuleLazy(".themedMobile]:", {
    HeaderBarIcon: filters.componentByCode('size:"custom",'),
    HeaderBar: filters.byCode(".themedMobile]:"),
});

// from toolbox
const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_TOP:", '.iconBadge,"top"');

const ArrowsLeftRightIcon = ({ color, ...rest }) => {
    return (
        <svg
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            fill={color}
            viewBox="0 0 24 24"
            {...rest}>
            <path d="M2.3 7.7a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 1.4L5.42 6H21a1 1 0 1 1 0 2H5.41l2.3 2.3a1 1 0 1 1-1.42 1.4l-4-4ZM17.7 21.7l4-4a1 1 0 0 0 0-1.4l-4-4a1 1 0 0 0-1.4 1.4l2.29 2.3H3a1 1 0 1 0 0 2h15.59l-2.3 2.3a1 1 0 0 0 1.42 1.4Z" />
        </svg>
    );
};

const WindowLaunchIcon = findComponentByCodeLazy("1-1h6a1 1 0 1 0 0-2H5Z");
const XSmallIcon = findComponentByCodeLazy("1.4L12 13.42l5.3 5.3Z");
const Chat = findComponentByCodeLazy("filterAfterTimestamp:", "chatInputType");
const Resize = findComponentByCodeLazy("sidebarType:", "homeSidebarWidth");
const ChannelHeader = findComponentByCodeLazy(".forumPostTitle]:", '"channel-".concat');
const PopoutWindow = findComponentByCodeLazy("Missing guestWindow reference");
const FullChannelView = findComponentByCodeLazy("showFollowButton:(null");

// love
const ppStyle = findLazy(m => m.popoutContent && Object.keys(m).length === 1);

const ChatInputTypes = findByPropsLazy("FORM", "NORMAL");
const Sidebars = findByPropsLazy("ThreadSidebar", "MessageRequestSidebar");

const ChannelSectionStore = findStoreLazy("ChannelSectionStore");

const requireChannelContextMenu = extractAndLoadChunksLazy(
    ["&&this.handleActivitiesPopoutClose(),"],
    new RegExp(DefaultExtractAndLoadChunksRegex.source + ".{1,150}isFavorite")
);

const MakeContextMenu = (id: string, guildId: string | null) => {
    return (
        <Menu.MenuItem
            id={`vc-sidebar-chat-${name}`}
            label={"Open Sidebar Chat"}
            action={() => {
                FluxDispatcher.dispatch({
                    // @ts-ignore
                    type: "NEW_SIDEBAR_CHAT",
                    guildId,
                    id,
                });
            }}
        />
    );
};

const UserContextPatch: NavContextMenuPatchCallback = (children, args: { user: User; }) => {
    const checks = [
        args.user,
        args.user.id !== UserStore.getCurrentUser().id,
    ];
    if (checks.some(check => !check)) return;
    children.push(MakeContextMenu(args.user.id, null));
};

const ChannelContextPatch: NavContextMenuPatchCallback = (children, args: { channel: Channel; }) => {
    const checks = [
        args.channel,
        args.channel.type !== 4, // categories
        PermissionStore.can(PermissionsBits.VIEW_CHANNEL, args.channel),
    ];
    if (checks.some(check => !check)) return;
    children.push(MakeContextMenu(args.channel.id, args.channel.guild_id));
};

export default definePlugin({
    name: "SidebarChat",
    authors: [Devs.Joona],
    description: "Open a another channel or a DM as a sidebar or as a popout",
    patches: [
        {
            find: 'case"pendingFriends":',
            replacement: {
                match: /return(\(0,\i\.jsxs?\)\(\i\.\i,{}\))}/,
                replace: "return [$1, $self.renderSidebar()]}"
            }
        },
    ],

    settings,

    /* setWidth: (w: number) => {
        FluxDispatcher.dispatch({
            // @ts-ignore
            type: "SIDEBAR_CHAT_WIDTH",
            newWidth: w
        });
    },*/

    contextMenus: {
        "user-context": UserContextPatch,
        "channel-context": ChannelContextPatch,
        "thread-context": ChannelContextPatch,
        "gdm-context": ChannelContextPatch,
    },

    renderSidebar() {
        const { guild, channel /* width*/ } = useStateFromStores(
            [SidebarStore, GuildStore, ChannelStore], () => {
                const { channelId, guildId } = SidebarStore.getState();
                return {
                    guild: GuildStore.getGuild(guildId),
                    channel: ChannelStore.getChannel(channelId)
                };
            }
        );

        const [channelSidebar, guildSidebar] = useStateFromStores(
            [ChannelSectionStore, SelectedChannelStore, ChannelStore], () => {
                const currentChannelId = SelectedChannelStore.getChannelId();
                const currentGuildId = SelectedGuildStore.getGuildId();
                return [
                    ChannelSectionStore.getSidebarState(currentChannelId),
                    ChannelSectionStore.getGuildSidebarState(currentGuildId),
                ];
            }
        );

        useEffect(() => {
            if (!channel?.id || MessageStore.getLastMessage(channel.id)) return;
            MessageActions.fetchMessages({
                channelId: channel.id,
                limit: 50,
            });
        }, [channel?.id]);

        const [width, setWidth] = useState(window.innerWidth);

        useLayoutEffect(() => {
            const handleResize = () => setWidth(window.innerWidth);

            window.addEventListener("resize", handleResize);
            return () => window.removeEventListener("resize", handleResize);
        });

        if (!channel || channelSidebar || guildSidebar) return null;

        return (
            <ErrorBoundary noop>
                <Resize
                    sidebarType={Sidebars.MessageRequestSidebar}
                    maxWidth={~~(width * 0.31)/* width - 690*/}
                >
                    <Header channel={channel} guild={guild} />
                    <Chat
                        channel={channel}
                        guild={guild}
                        chatInputType={ChatInputTypes.SIDEBAR}
                    />
                </Resize>
            </ErrorBoundary>
        );
    },
});

const Header = ({ guild, channel }: { guild: Guild; channel: Channel; }) => {
    const recipientId = channel.isPrivate() ? channel.getRecipientId() as string : null;

    const name = useStateFromStores([UserStore, RelationshipStore], () => {
        if (!recipientId || channel.name) return channel.name;

        const user = UserStore.getUser(recipientId);
        return RelationshipStore.getNickname(recipientId) || user?.globalName || user?.username;
    }, [recipientId, channel.name]);

    const parentChannel = useStateFromStores(
        [ChannelStore], () => ChannelStore.getChannel(channel?.parent_id),
        [channel?.parent_id]
    );

    // @ts-ignore
    const closeSidebar = () => FluxDispatcher.dispatch({ type: "CLOSE_SIDEBAR_CHAT", });

    const openPopout = useCallback(async () => {
        await requireChannelContextMenu();
        PopoutActions.open(
            `DISCORD_VC_SC-${channel.id}`,
            () => <RenderPopout channel={channel} name={name} />,
            {
                defaultWidth: 854,
                defaultHeight: 480,
            }
        );
    }, [channel, name]);

    const switchChannels = useCallback(() => {
        FluxDispatcher.dispatch({
            // @ts-ignore
            type: "NEW_SIDEBAR_CHAT",
            guildId: channel.guild_id,
            id: channel.id,
        });
        ChannelRouter.transitionToChannel(channel.id);
    }, [channel.id]);

    return (
        <HeaderBar
            toolbar={
                <>
                    <HeaderBarIcon icon={ArrowsLeftRightIcon} tooltip="Switch channels" onClick={switchChannels} />
                    <HeaderBarIcon icon={WindowLaunchIcon} tooltip="Popout Chat" onClick={openPopout} />
                    <HeaderBarIcon icon={XSmallIcon} tooltip="Close Sidebar Chat" onClick={closeSidebar} />
                </>
            }
        >
            <ChannelHeader
                channel={channel}
                channelName={name}
                guild={guild}
                parentChannel={parentChannel}
            />
        </HeaderBar>
    );
};

const RenderPopout = ErrorBoundary.wrap(({ channel, name }: { channel: Channel; name: string; }) => {
    // Copy from an unexported function of the one they use in the experiment
    // right click a channel and search withTitleBar:!0,windowKey
    return (
        <PopoutWindow
            withTitleBar
            windowKey={`DISCORD_VC_SC-${channel.id}`}
            title={name || "Vencord"}
            channelId={channel.id}
            contentClassName={ppStyle.popoutContent}
        >
            <FullChannelView providedChannel={channel} />
        </PopoutWindow>
    );
});
