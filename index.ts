import {clients, IMFPClient, MFPClientInfo} from "./src/types";

export default {
    latestVersion: 1,
    createClient(info: MFPClientInfo): IMFPClient {
        info.secure = info.secure ?? false;
        info.reconnectOnClose = info.reconnectOnClose ?? true;
        info.version = info.version ?? this.latestVersion;
        const client = (<any>clients)["v" + info.version];
        if (client)
            return new client(info);
        throw new Error("Unsupported MFP version: " + info.version);
    }
}