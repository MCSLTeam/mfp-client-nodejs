import Retcode from './retcode';

export type MFPActionResponse = {
    status: MFPStatus
    retcode: Retcode
    data: any,
    message: string
};

export type MFPStatus = 'ok' | 'error';

export type MFPActions =
    'subscribe_event' |
    'unsubscribe_event' |
    'ping' |
    'get_system_info' |
    'get_permissions' |
    'get_java_list' |
    'get_directory_info' |
    'get_file_info' |
    'file_upload_request' |
    'file_upload_chunk' |
    'file_upload_cancel' |
    'file_download_request' |
    'file_download_range' |
    'file_download_close' |
    'add_instance' |
    'remove_instance' |
    'start_instance' |
    'stop_instance' |
    'kill_instance' |
    'send_to_instance' |
    'get_instance_status' |
    'get_all_status';

export type MFPServerEvents =
    'instance_log' |
    'daemon_report';

export type MFPClientEvents = 'open' | 'close' | 'info';

export type MFPClientInfo = {
    host: string
    port?: number
    token: string
    secure?: boolean
};

export type MFPServerInfo = {
    name: string,
    version: string,
    apiVersion: string
};