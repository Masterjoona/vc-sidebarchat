/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { proxyLazy } from "@utils/lazy";
import { OptionType } from "@utils/types";
import { Flux as TFlux } from "@vencord/discord-types";
import { Flux as FluxWP, FluxDispatcher, PrivateChannelsStore } from "@webpack/common";

interface IFlux extends TFlux {
    PersistedStore: TFlux["Store"];
}

export const settings = definePluginSettings({
    persistSidebar: {
        type: OptionType.BOOLEAN,
        description: "Keep the sidebar chat open across Discord restarts",
        default: true,
    }
});

export const SidebarStore = proxyLazy(() => {
    let guildId = "";
    let channelId = "";
    let width = 0;
    class SidebarStore extends (FluxWP as IFlux).PersistedStore {
        static persistKey = "SidebarStore";
        // @ts-ignore
        initialize(previous: { guildId?: string; channelId?: string; width?: number; } | undefined) {
            if (!settings.store.persistSidebar || !previous) return;
            const { guildId: prevGId, channelId: prevCId, width: prevWidth } = previous;
            guildId = prevGId || "";
            channelId = prevCId || "";
            width = prevWidth || 0;
        }

        getState() {
            return {
                guildId,
                channelId,
                width
            };
        }
    }

    const store = new SidebarStore(FluxDispatcher, {
        // @ts-ignore
        async NEW_SIDEBAR_CHAT({ guildId: newGId, id }: { guildId: string | null; id: string; }) {
            guildId = newGId || "";

            if (guildId) {
                channelId = id;
                store.emitChange();
                return;
            }

            channelId = await PrivateChannelsStore.getOrEnsurePrivateChannel(id);
            store.emitChange();
        },

        CLOSE_SIDEBAR_CHAT() {
            guildId = "";
            channelId = "";
            store.emitChange();
        },

        /* SIDEBAR_CHAT_WIDTH({ newWidth }: { newWidth: number; }) {
            width = newWidth;
            store.emitChange();
        }*/
    });

    return store;
});
