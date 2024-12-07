import axios from "axios";
import {IMFPClient, MFPClientInfo} from "../types";
import {MFPActionResponseV1, MFPActionsV1, MFPEventsV1} from "./types";
import {nanoid} from "nanoid";
import {sleep} from "../utils";
import RetcodeV1 from "./retcode";

export default class MFPClientV1 extends EventTarget implements IMFPClient {
    public readonly info: MFPClientInfo;
    private _websocket: WebSocket | null = null;
    private _actionRes: Map<string, MFPActionResponseV1> = new Map();
    private _pingInterval: any = undefined;

    constructor(info: MFPClientInfo) {
        super();
        this.info = info;
        this.info.version = info.version ?? 1;
        this.info.reconnectOnClose = info.reconnectOnClose ?? true;
    }

    private async login(): Promise<string> {
        const loginUrl = `${this.info.secure ? 'https' : 'http'}://${this.info.host}:${this.info.port}/login`;
        return (await axios(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: {
                usr: this.info.username,
                pwd: this.info.password
            }
        })).data;
    }

    getWsUrl(token: string): string {
        return `${this.info.secure ? 'wss' : 'ws'}://${this.info.host}:${this.info.port}/api/v${this.info.version}?token=${token}`;
    }

    async connect() {
        clearInterval(this._pingInterval)
        const token = await this.login();
        this._websocket = new WebSocket(this.getWsUrl(token));
        this._websocket?.addEventListener('open', () => {
            this.dispatchEvent(new CustomEvent('open'));
            console.log(this.logPrefix() + 'Connected to server');
        });
        this._websocket?.addEventListener('close', (e) => {
            clearInterval(this._pingInterval)
            this.dispatchEvent(new CustomEvent('close', {
                detail: {
                    reconnect: this.info.reconnectOnClose,
                    code: e.code,
                    reason: e.reason,
                    wasClean: e.wasClean
                }
            }));
            if (this.info.reconnectOnClose && e.reason != 'mfpclient-close') {
                console.log(this.logPrefix() + 'Disconnected from server, reconnecting');
                try {
                    this.connect();
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
                this._actionRes.set(data.echo, {
                    status: data.status,
                    retcode: RetcodeV1.of(data.retcode),
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

    async executeAction(action: MFPActionsV1, params: any = {}): Promise<MFPActionResponseV1> {
        if (!this.connected())
            throw new Error('MFPClient not connected');
        const echo = nanoid(16);
        const data = JSON.stringify({
            action,
            params,
            echo
        });
        console.debug(this.logPrefix() + 'Executing action: ', data);
        this._websocket?.send(data);
        while (!this._actionRes.has(echo)) {
            await sleep(100);
        }
        const res = this._actionRes.get(echo)!;
        this._actionRes.delete(echo);
        return res;
    }

    addEventListener(type: MFPEventsV1, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
        super.addEventListener(type, callback, options);
    }

    removeEventListener(type: MFPEventsV1, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
        super.removeEventListener(type, callback, options);
    }

    private logPrefix() {
        return `[MFPClientV1 - ${this.info.username}@${this.info.host}:${this.info.port}] `;
    }
}