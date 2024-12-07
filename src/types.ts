import Retcode from "./retcode";

export type MFPActionResponse = {
    status: MFPStatus
    retcode: Retcode
    data: any,
    message: string
};

export type MFPStatus = 'ok' | 'error';

export type MFPActions =
    'ping'
    | 'file_upload_request'
    | 'file_upload_chunk'
    | 'file_upload_cancel'
    | 'get_file_info'
    | 'get_directory_info'
    | 'file_download_request'
    | 'file_download_chunk'
    | 'file_download_close';

export type MFPEvents = 'instance_log';

export type MFPClientInfo = {
    host: string
    port: number
    username: string,
    password: string,
    secure?: boolean
    reconnectOnClose?: boolean
};