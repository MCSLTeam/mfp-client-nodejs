import {sleep} from './src/utils';
import Retcode from './src/retcode';
import {
    MFPActionResponse,
    MFPActions,
    MFPClientEvents,
    MFPClientInfo,
    MFPServerEvents,
    MFPServerInfo
} from './src/types';
import axios from 'axios';
import {v4} from "uuid";

export default class MFPClient extends EventTarget {
    public readonly clientInfo: MFPClientInfo;
    private _serverInfo?: MFPServerInfo;
    private _websocket: WebSocket | null = null;
    private _actionRes: Map<string, MFPActionResponse> = new Map();
    private _pingInterval: any;
    private readonly _reconnectOnClose: boolean;

    constructor(info: MFPClientInfo, reconnectOnClose: boolean = true) {
        super();
        let secure = false;
        try {
            secure = location.protocol == 'https:'
        } catch (ignored) {
            // nodejs
        }
        info.port = info.port ?? 11451;
        info.secure = info.secure ?? secure;
        this.clientInfo = info;
        this._reconnectOnClose = reconnectOnClose;
    }

    async getServerInfo(timeout: number = 10000): Promise<MFPServerInfo> {
        if (!this._serverInfo) {
            const res = (await axios(this.getInfoUrl(), {
                timeout,
                timeoutErrorMessage: 'Timed out while fetching server info'
            })).data
            const data: MFPServerInfo = {
                name: res.name,
                version: res.version,
                apiVersion: res.api_version
            }
            if (data.apiVersion != 'v1') throw Error('Unsupported api version')
            this._serverInfo = data
            this.dispatchEvent(new CustomEvent('info', {
                detail: data
            }));
            return this.getServerInfo(timeout)
        }
        return this._serverInfo;
    }

    public async tryConnect(timeout: number = 10000): Promise<boolean> {
        try {
            await this.getServerInfo(timeout)
            return true
        } catch (e) {
            return false
        }
    }

    getInfoUrl(): string {
        return `${this.clientInfo.secure ? 'https' : 'http'}://${this.clientInfo.host}:${this.clientInfo.port}/info`;
    }

    getWsUrl(token: string): string {
        return `${this.clientInfo.secure ? 'wss' : 'ws'}://${this.clientInfo.host}:${this.clientInfo.port}/api/v1?token=${token}`;
    }

    async connect(timeout: number = 10000) {
        clearInterval(this._pingInterval)
        await this.getServerInfo(timeout)
        this._websocket = new WebSocket(this.getWsUrl(this.clientInfo.token));
        this._websocket?.addEventListener('open', () => {
            this.dispatchEvent(new CustomEvent('open'));
            console.log(this.logPrefix() + 'Connected to server');
        });
        this._websocket?.addEventListener('close', async (e) => {
            clearInterval(this._pingInterval)
            this.dispatchEvent(new CustomEvent('close', {
                detail: {
                    reconnect: this._reconnectOnClose,
                    code: e.code,
                    reason: e.reason,
                    wasClean: e.wasClean
                }
            }));
            if (this._reconnectOnClose && e.reason != 'mfpclient-close') {
                console.log(this.logPrefix() + 'Disconnected from server, reconnecting in 5 secs');
                await sleep(5000)
                try {
                    await this.connect();
                } catch (e) {
                    console.error(this.logPrefix() + 'Failed reconnecting to server: ', e);
                }
            } else {
                console.log(this.logPrefix() + 'Disconnected from server');
            }
        });
        this._websocket?.addEventListener('message', (e) => {
            let data;
            try {
                data = JSON.parse(e.data);
            } catch (ex) {
                console.warn(this.logPrefix() + 'Error parsing data received from MFPServer: ', e.data, ex);
            }
            if (data.event) {
                console.debug(this.logPrefix() + 'Event triggered: ', data)
                this.dispatchEvent(new CustomEvent(data.event, {
                    detail: {
                        data: data.data,
                        time: data.time
                    }
                }));
            } else if (data.status) {
                console.debug(this.logPrefix() + 'Action executed: ', data);
                this._actionRes.set(data.id, {
                    status: data.status,
                    retcode: Retcode.of(data.retcode),
                    data: data.data,
                    message: data.message
                });
            } else {
                console.warn(this.logPrefix() + 'Unknown data received from MFPServer: ', data);
            }
        });
        this._pingInterval = setInterval(async () => {
            if (this.connected()) {
                let success = false;
                this.executeAction('ping').then(() => success = true);
                await sleep(10000);
                if (!success) {
                    console.warn(this.logPrefix() + 'Ping took too long, disconnecting');
                    this._websocket?.close(4000, 'mfpclient-pingtoolong');
                }
            }
        }, 60000);
        const start = Date.now()
        let err = false
        this._websocket.onerror = () => err = true
        while (!this.connected()) {
            if (err) {
                console.error(this.logPrefix() + 'Error while connecting to server')
                throw new Error('Error while connecting to server')
            } else if (Date.now() - start > timeout) {
                console.error(this.logPrefix() + 'Timed out while connecting to server')
                throw new Error('Timed out while connecting to server')
            }
            await sleep(100);
        }
    }

    close() {
        this._websocket?.close(1000, 'mfpclient-close');
    }

    connected() {
        return this._websocket?.readyState === WebSocket.OPEN;
    }

    closed() {
        return this._websocket?.readyState === WebSocket.CLOSED;
    }

    async executeAction(action: MFPActions | string, params: any = {}): Promise<MFPActionResponse> {
        if (!this.connected())
            throw new Error('MFPClient not connected');
        const id = v4()
        const data = JSON.stringify({
            action,
            params,
            id
        });
        console.debug(this.logPrefix() + 'Executing action: ', data);
        this._websocket?.send(data);
        while (!this._actionRes.has(id)) {
            await sleep(100);
        }
        const res = this._actionRes.get(id)!;
        this._actionRes.delete(id);
        return res;
    }

    override addEventListener(type: MFPServerEvents | MFPClientEvents | string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
        super.addEventListener(type, callback, options);
    }

    override removeEventListener(type: MFPServerEvents | MFPClientEvents | string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
        super.removeEventListener(type, callback, options);
    }

    private logPrefix() {
        return `[MFPClientV1 - ${this.clientInfo.host}:${this.clientInfo.port}] `;
    }
}

async function requestSubtoken(info: MFPClientInfo, expires: number = 30, permissions: string[] = ['*'], timeout: number = 10000): Promise<string> {
    if (info.token.includes('.')) // jwt
        throw new Error('Not a main token')
    if (permissions.some(p => !/^(([a-zA-Z-_]+|\*{1,2})\.)*([a-zA-Z-_]+|\*{1,2})$/gm.test(p)))
        throw new Error('Invalid permission')
    return (await axios(`${info.secure ? 'https' : 'http'}://${info.host}:${info.port}/subtoken`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout,
        timeoutErrorMessage: 'Timed out while requesting subtoken',
        data: {
            token: info.token,
            expires: expires,
            permissions: permissions.join(',')
        }
    })).data
}

export {MFPActionResponse, MFPActions, MFPClientInfo, MFPServerEvents, MFPClientEvents, Retcode, requestSubtoken}