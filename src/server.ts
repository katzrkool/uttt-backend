import {createServer} from 'http';
import * as sockjs from 'sockjs';
import {GameManager} from './gameManager';
import * as Sentry from '@sentry/node';

const gameManager = new GameManager();

if (process.env.REACT_APP_UTTT_FRONTEND_DSN) {
    Sentry.init({
        dsn: process.env.REACT_APP_UTTT_BACKEND_DSN,
    });
}


const echo = sockjs.createServer({ prefix:'/api' });
echo.on('connection', function(conn) {
    conn.on('data', function(message) {
        processMessage(message, conn).then((resp) => {
            conn.write(JSON.stringify(resp));
        });
    });
});

async function processMessage(message: string, conn: sockjs.Connection): Promise<Record<string, unknown>> {
    const data = JSON.parse(message);
    if (!Object.keys(data).includes('action')) {
        return {
            error: true,
            message: 'No action was provided',
            msgID: data.msgID ?? 'unknown'
        };
    }
    if (data.action === 'createPrivate') {
        if (data.name === undefined) {
            return {
                error: true,
                message: 'No name was provided',
                msgID: data.msgID ?? 'unknown'
            };
        }
        const privateResp = await gameManager.createMatch(data.name, true, data.visible ?? true);
        gameManager.appendToSubscriptions(privateResp.code, conn, privateResp.userID);
        return {
            error: false,
            msgID: data.msgID ?? 'unknown',
            code: privateResp.code,
            userID: privateResp.userID
        };
    } else if (data.action === 'joinMatch') {
        if (data.code === undefined) {
            return {
                error: true,
                message: 'No code was provided',
                msgID: data.msgID ?? 'unknown'
            };
        } else if (data.name === undefined) {
            return {
                error: true,
                message: 'No name was provided',
                msgID: data.msgID ?? 'unknown'
            };
        }
        const resp = await gameManager.joinMatch(data.code, data.name, conn);
        gameManager.appendToSubscriptions(data.code, conn, resp.userID as string);
        resp.msgID = data.msgID ?? 'unknown';
        return resp;
    } else if (data.action === 'matchmake') {
        if (data.name === undefined) {
            return {
                error: true,
                message: 'No name was provided',
                msgID: data.msgID ?? 'unknown'
            };
        }
        const openMatch = await gameManager.fetchOpenMatch();
        if (openMatch) {
            const resp = await gameManager.joinMatch(openMatch, data.name, conn);
            gameManager.appendToSubscriptions(openMatch, conn, resp.userID as string);
            resp.msgID = data.msgID ?? 'unknown';
            return resp;
        } else {
            const resp = await gameManager.createMatch(data.name, false);
            gameManager.appendToSubscriptions(resp.code, conn, resp.userID as string);
            return {
                code: resp.code,
                error: false,
                userID: resp.userID,
                msgID: data.msgID ?? 'unknown'
            };
        }
    } else if (data.action === 'makeMove') {
        // making sure all the params are here
        for (const param of ['board', 'square', 'userID', 'code']) {
            if (data[param] === undefined) {
                return {
                    error: true,
                    message: `No ${param} was provided`,
                    msgID: data.msgID ?? 'unknown'
                };
            } 
        }
        const resp = await gameManager.makeMove(data.code, data.board, data.square, data.userID, conn);
        return Object.assign({}, resp, {error: false, msgID: data.msgID ?? 'unknown'});
    } else if (data.action === 'checkStatus' || data.action === 'subscribe' || data.action === 'spectateRandomMatch') {
        let code: string;
        if (data.action === 'spectateRandomMatch') {
            const ongoingMatch = await gameManager.fetchOngoingMatch();
            if (ongoingMatch) {
                code = ongoingMatch;
            } else {
                return {
                    error: false,
                    found: false,
                    msgID: data.msgID ?? 'unknown'
                };
            }
        } else {
            if (data.code === undefined) {
                return {
                    error: true,
                    message: 'No code was provided',
                    msgID: data.msgID ?? 'unknown'
                };
            }
            code = data.code;
        }
        if (data.action === 'subscribe') {
            gameManager.appendToSubscriptions(code, conn, data.userID);
        }
        const resp = await gameManager.checkStatus(code, data.userID);
        resp.msgID = data.msgID ?? 'unknown';
        return resp;
    } else if (data.action === 'stopMatchmake') {
        if (data.code === undefined) {
            return {
                error: true,
                message: 'No code was provided',
                msgID: data.msgID ?? 'unknown'
            };
        }
        if (data.userID === undefined) {
            return {
                error: true,
                message: 'No userID was provided',
                msgID: data.msgID ?? 'unknown'
            };
        }
        await gameManager.stopMatchmake(data.code, data.userID, conn);
        return {
            error: false,
            msgID: data.msgID ?? 'unknown'
        };
    } else {
        return {
            error: true,
            message: 'Unknown action',
            msgID: data.msgID ?? 'unknown'
        };
    }
}

// 3. Usual http stuff
const server = createServer();
server.addListener('upgrade', function (_req, res) {
    res.end();
});

echo.installHandlers(server);
console.log(' [*] Listening on 0.0.0.0:40404');
server.listen(40404, '0.0.0.0');