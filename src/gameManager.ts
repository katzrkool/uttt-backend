import {createEmptyBoard} from './sampleBoard';
import Square from './interfaces/Square';
import GlobalBoard from './interfaces/GlobalBoard';
import LocalBoard from './interfaces/LocalBoard';
import Position from './interfaces/Position';
import {randomBytes} from 'crypto';
import {readFileSync} from 'fs';
import {Connection} from 'sockjs';

import { createHandyClient, IHandyRedis } from 'handy-redis';

const words = JSON.parse(readFileSync('./words.json', 'utf-8'));

enum MakeMoveStatus {
    Success = 'Success',
    OutOfTurn = 'OutOfTurn',
    InvalidPosition = 'InvalidPosition',
    UnknownError = 'UnknownError',
    GameNotFound = 'GameNotFound',
    InvalidGame = 'InvalidGame'
}

interface WinStatus {
    winChar: Square;
    status: LocalBoard;
}

interface Subscription {
    conn: Connection,
    userID: string | undefined,
}

const possibleWins = [
    // The horizontals!
    [Position.topLeft, Position.topCenter, Position.topRight],
    [Position.centerLeft, Position.centerCenter, Position.centerRight],
    [Position.bottomLeft, Position.bottomCenter, Position.bottomRight],
    // The verticals
    [Position.topLeft, Position.centerLeft, Position.bottomLeft],
    [Position.topCenter, Position.centerCenter, Position.bottomCenter],
    [Position.topRight, Position.centerRight, Position.bottomRight],
    // The diagonals
    [Position.topLeft, Position.centerCenter, Position.bottomRight],
    [Position.bottomLeft, Position.centerCenter, Position.topRight]
];

class GameManager {
    subscriptions: Record<string, Subscription[]>;
    client: IHandyRedis;
    constructor() {
        this.client = createHandyClient();
        // This is in memory and not in redis because we don't need this to be persisted. In fact, if the server restarts, all of this data is useless
        this.subscriptions = {};
    }

    createBoard(): GlobalBoard {
        return createEmptyBoard();
    }
    
    appendToSubscriptions(code: string, conn: Connection, userID?: string): void {
        if (this.subscriptions[code] === undefined) {
            this.subscriptions[code] = [];
        }
        
        this.subscriptions[code].push({
            conn,
            userID
        });
    }
    
    async stopMatchmake(code: string, userID: string, conn: Connection): Promise<void> {
        const rawMatch = await this.client.get(code);
        if (!rawMatch) {
            return;
        }
        if (this.subscriptions[code] !== undefined) {
            this.subscriptions[code] = this.subscriptions[code].filter((subscription: Subscription) => subscription.conn !== conn);
        }
        const match = JSON.parse(rawMatch);
        match.players = match.players.filter((player) => player.userID !== userID);
        if (match.players.length === 0) {
            await this.client.del(code);
            return;
        }
        
        match.lastMove = Date.now();
        await this.client.set(code, JSON.stringify(match), ['EX', 4838400]);
    }
    
    async createMatch(playerName: string, privateMatch: boolean, visible = true): Promise<{code: string, userID: string}> {
        const userID = randomBytes(20).toString('hex').substring(0, 20);
        let code = `${words[Math.floor(Math.random() * words.length)]}-${words[Math.floor(Math.random() * words.length)]}`;
        
        // Check to make sure no game is being overwritten
        while (await this.client.exists(code) === 1) {
            code = `${words[Math.floor(Math.random() * words.length)]}-${words[Math.floor(Math.random() * words.length)]}`;
        }
        
        // Initialize the game data; expire in 8 weeks
        await this.client.set(code, JSON.stringify({
            board: this.createBoard(),
            players: [
                {
                    userID,
                    name: playerName.length > 0 ? playerName : 'Nameless Wonder',
                    isX: undefined
                }
            ],
            code,
            started: false,
            // this can be 'X', 'O', or ''. This also signifies if the game is over or not.
            winStatus: '',
            visible,
            lastMove: 0,
            privateMatch,
            subscribers: [],
            isXTurn: true,
            gameStart: 0,
            gameEnd: 0,
        }), ['EX', 4838400]);
        
        if (visible) {
            await this.client.sadd('ongoing-public-matches', code);
        }
        
        if (!privateMatch) {
            // If a matchmaking game, add it to the matchmaking queue
            await this.client.rpush('matchmaking-queue', code);
        }
        
        return {
            code,
            userID
        };
    }
    
    async fetchOpenMatch(): Promise<string | undefined> {
        // this will either return a code, or an undefined
        const code =  await this.client.lpop('matchmaking-queue');
        if (!code) {
            return code;
        }
        const resp = await this.client.get(code);
        // If code exists, but game doesn't exist, try again
        if (!resp) {
            return await this.fetchOpenMatch();
        }
        const game = JSON.parse(resp);
        // Match has already started
        if (game.started) {
            return await this.fetchOpenMatch();
        }
        return code;
    }
    
    async fetchOngoingMatch(): Promise<string | undefined> {
        const code = await this.client.srandmember('ongoing-public-matches');
        if (!code) {
            return undefined;
        }
        const match = await this.client.get(code);
        if (!match) {
            await this.client.srem('ongoing-public-matches', code);
            return await this.fetchOngoingMatch();
        }
        // If match is over
        if (JSON.parse(match).winStatus !== '') {
            await this.client.srem('ongoing-public-matches', code);
            return await this.fetchOngoingMatch();
        }
        return code;
    }
    
    async checkStatus(code: string, userID?: string | undefined): Promise<Record<string, unknown>> {
        const resp = await this.client.get(code);
        if (!resp) {
            return {
                error: false,
                found: false
            };
        }
        const match = JSON.parse(resp);
        
        const players = match.players.map((player) => {
            if (player.userID === userID) {
                return {
                    name: player.name,
                    isX: player.isX,
                    userID: player.userID
                };
            } else {
                return {
                    name: player.name,
                    isX: player.isX
                };
            }
        });
        const winStatus = this.checkGlobalWin(match.board);
        // If someone has won but no gameend has been set, set one
        if (winStatus.winChar !== Square.Empty && match.gameEnd === 0) {
            match.gameEnd = match.lastMove;
            await this.client.set(code, JSON.stringify(match), ['EX', 4838400]);
        }
        
        return {
            error: false,
            board: match.board,
            started: match.started,
            found: true,
            players,
            gameStart: match.gameStart,
            gameEnd: match.gameEnd,
            winStatus: this.checkGlobalWin(match.board)
        };
        
    }
    
    async joinMatch(code: string, name: string, conn: Connection): Promise<Record<string, unknown>> {
        const rawMatch = await this.client.get(code);
        if (!rawMatch) {
            return {
                error: false,
                found: false,
            };
        }
        if (name.length === 0) {
            return {
                error: true,
                found: JSON.parse(rawMatch).found ?? false,
                message: 'Names must be at least 1 character long'
            };
        }
        const match = JSON.parse(rawMatch);
        
        const userID = randomBytes(20).toString('hex').substring(0, 20);
        if (match.started) {
            return await this.checkStatus(code);
        }
        const otherPlayers = this.subscriptions[code]?.filter((subscription) => subscription.userID !== undefined);
        
        if (otherPlayers === undefined || otherPlayers.length === 0 || otherPlayers[0].conn.readyState > 1) {
            // If the other player disconnected them, remove them from the game.
            if(otherPlayers !== undefined && otherPlayers[0]?.conn?.readyState > 1) {
                this.subscriptions[code].splice(this.subscriptions[code].indexOf(otherPlayers[0]));
            }
            this.appendToSubscriptions(code, conn, userID);
            match.players.push(
                {
                    userID,
                    name: name.length > 0 ? name : 'Nameless Wonder',
                    isX: undefined
                }
            );
            
            match.lastMove = Date.now();
            await this.client.set(code, JSON.stringify(match), ['EX', 4838400]);
            if (!match.privateMatch) {
                await this.client.rpush('matchmaking-queue', code);
            }
            return {
                error: false,
                started: match.started,
                userID,
                found: true,
                code
            };
        } else if (otherPlayers[0].conn === conn) {
            // this checks if the other player has the same websocket connection, basically checking if its the same person
            // In case the user changed their name
            match.players = [
                {
                    userID: otherPlayers[0].userID,
                    name: name.length > 0 ? name : 'Nameless Wonder',
                    isX: undefined
                }
            ];
            
            match.lastMove = Date.now();
            await this.client.set(code, JSON.stringify(match), ['EX', 4838400]);
            if (!match.privateMatch) {
                await this.client.rpush('matchmaking-queue', code);
            }
            return {
                error: false,
                started: match.started,
                userID: otherPlayers[0].userID,
                found: true,
                code
            };
        }
        
        match.started = true;
        const opponent = match.players[0];
        
        // Flip the metaphorical coin to see who goes first.
        const clientIsX = Math.random() >= 0.5;
        match.players = [
            {
                userID: opponent.userID,
                name: opponent.name,
                isX: !clientIsX
            },
            {
                userID,
                name: name.length > 0 ? name : 'Nameless Wonder',
                isX: clientIsX
            }
        ];
        const gameStart = Date.now();
        match.gameStart = gameStart;
        
        match.lastMove = Date.now();
        await this.client.set(code, JSON.stringify(match), ['EX', 4838400]);
        
        await this.client.lrem('matchmaking-queue', 1, code);
        
        // Get the other person in the subscriber list. This client hasn't been added yet, so it'll be the first and only person
        for (const subscriber of this.subscriptions[code]) {
            if (subscriber.userID !== undefined) {
                subscriber.conn.write(JSON.stringify({
                    msgType: 'matchStarted',
                    started: match.started,
                    gameConfig: {
                        opponent: name.length > 0 ? name : 'Nameless Wonder',
                        isX: !clientIsX,
                        gameStart
                    },
                    code,
                    userID: subscriber.userID,
                    found: true
                }));
            } else {
                subscriber.conn.write(JSON.stringify({
                    msgType: 'matchStarted',
                    started: match.started,
                    players: match.players.map((player) => {
                        // Remove the userIDs
                        return {
                            name: player.name,
                            isX: player.isX,
                        };
                    }),
                    found: true
                }));
            }
        }
        
        
        conn.write(JSON.stringify({
            msgType: 'matchStarted',
            started: match.started,
            gameConfig: {
                opponent: opponent.name,
                isX: clientIsX,
                gameStart
            },
            code,
            userID: userID,
            found: true
        }));
        
        return {
            error: false,
            started: match.started,
            gameConfig: {
                opponent: opponent.name,
                isX: clientIsX,
                gameStart
            },
            code,
            userID,
            found: true
        };
    }
    
    checkGlobalWin(board: GlobalBoard): WinStatus {
        const status: LocalBoard = {
            topLeft: Square.Empty,
            topCenter: Square.Empty,
            topRight: Square.Empty,
            centerLeft: Square.Empty,
            centerCenter: Square.Empty,
            centerRight: Square.Empty,
            bottomLeft: Square.Empty,
            bottomCenter: Square.Empty,
            bottomRight: Square.Empty,
        };
        for (const pos of Object.keys(Position)) {
            if (pos !== Position.any) {
                status[pos] = this.checkLocalWin(board[pos]);
            }
        }
        return {winChar: this.checkLocalWin(status), status};
    }
    
    checkLocalWin(board: LocalBoard): Square {
        for (const scenario of possibleWins) {
            if (board[scenario[0]] !== Square.Empty && board[scenario[0]] === board[scenario[1]] && board[scenario[1]] === board[scenario[2]]) {
                return board[scenario[0]];
            }
        }
        // if no more free spaces
        if (Object.values(board).filter((square) => square === Square.Empty).length === 0) {
            return Square.Tie;
        }
        return Square.Empty;
    }
    
    async makeMove(code: string, localBoard: Position, square: Position, userID: string, conn: Connection): Promise<{status: MakeMoveStatus, board: GlobalBoard | null, winStatus: WinStatus | null, code: string, gameEnd: number}>  {
        const resp = await this.client.get(code);
        if (!resp) {
            return {
                status: MakeMoveStatus.GameNotFound,
                board: null,
                winStatus: null,
                code,
                gameEnd: 0
            };
        }
        const gameData = JSON.parse(resp);
        
        const players = gameData.players.filter((player) => player.userID === userID);
        if (players.length === 0) {
            return {
                status: MakeMoveStatus.InvalidGame,
                board: null,
                winStatus: null,
                code,
                gameEnd: 0
            };
        }
        const player = players[0];
        const board: GlobalBoard = gameData.board;
        let winStatus = this.checkGlobalWin(board);

        if (player.isX !== board.xTurn) {
            // send the updated board along
            conn.write(JSON.stringify({
                msgType: 'moveUpdate',
                board,
                winStatus,
                code
            }));
            return {status: MakeMoveStatus.OutOfTurn, board, winStatus, code, gameEnd: 0};
        }
        
        if ((board.activeBoard !== localBoard && board.activeBoard !== Position.any) || board[localBoard][square] !== Square.Empty || winStatus.status[localBoard] !== Square.Empty) {
            // send the updated board along
            conn.write(JSON.stringify({
                msgType: 'moveUpdate',
                board,
                winStatus,
                code
            }));
            return {status: MakeMoveStatus.InvalidPosition, board, winStatus, code, gameEnd: 0};
        }
        
        board[localBoard][square] = player.isX ? Square.X : Square.O;
        board.xTurn = !player.isX;
        winStatus = this.checkGlobalWin(board);
        gameData.winStatus = winStatus;
        if (winStatus.winChar !== Square.Empty) {
            await this.client.srem('ongoing-public-matches', code);
            const gameEnd = Date.now();
            gameData.gameEnd = gameEnd;
        }
        
        // Decide where the next player needs to be sent.
        // If there are any empty squares in the chosen one, sent them there. If not, let them play anywhere.
        // if the square is won, let them play anywhere else.
        if (Object.keys(board[square]).filter((localSquare) => board[square][localSquare] === Square.Empty).length > 0 && winStatus.status[square] === Square.Empty) {
            board.activeBoard = square;
        } else {
            board.activeBoard = Position.any;
        }
        gameData.board = board;
        
        gameData.lastMove = Date.now();
        await this.client.set(code, JSON.stringify(gameData), ['EX', 4838400]);
        const subscribers = this.subscriptions[code];
        
        if (subscribers) {
            for (const subscriber of subscribers) {
                if (subscriber.conn.readyState > 1) {
                    this.subscriptions[code]
                        .splice(this.subscriptions[code].indexOf(subscriber), 1);
                } else if (subscriber.conn.readyState === 1) {
                    // Send all subscribers the update.
                    subscriber.conn.write(JSON.stringify({
                        msgType: 'moveUpdate',
                        board,
                        winStatus,
                        code,
                        gameEnd: gameData.gameEnd
                    }));
                }
            }
        } else {
            this.subscriptions[code] = [{
                conn,
                userID
            }];
        }
        
        // If game is over, remove it from the ongoing-public-matches set.
        if (winStatus.winChar !== Square.Empty) {
            await this.client.srem('ongoing-public-matches', code);
        }
        
        return {
            status: MakeMoveStatus.Success,
            board,
            winStatus,
            code,
            gameEnd: gameData.gameEnd
        };
    }
}

export {GameManager, MakeMoveStatus};