import Retcode from "./retcode";

export type MFPActionResponseV1 = {
    status: MFPStatusV1
    retcode: Retcode
    data: any,
    message: string
};

export type MFPStatusV1 = 'ok' | 'error';

export type MFPActionsV1 =
    'ping'
    | 'file_upload_request'
    | 'file_upload_chunk'
    | 'file_upload_cancel'
    | 'get_file_info'
    | 'get_directory_info'
    | 'file_download_request'
    | 'file_download_chunk'
    | 'file_download_close';

export type MFPEventsV1 = 'instance_log';