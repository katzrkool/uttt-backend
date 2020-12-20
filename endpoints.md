# UTTT Backend Endpoints
## General
Backend is a SockJS endpoints located at `/api`.

Messages should be stringified JSON with a basic format as seen below. Each request type will most likely have other associated parameters.
```json
{
	"action": ACTION,
	"msgID": RANDOMSTRING, // the same msgID is sent back in the response. To keep track of request and response pairs.
}
```

Responses will have two properties by default:
* error:  boolean. If there was an error or not. If there is, a "message" property will display what's wrong.
* msgID: string. The same as the msgID passed in, to keep track of which message is which.
```json
{
	"error": boolean,
	"msgID": sameRandomString
}
```

## Request Types 
The following actions are available for use:

* [subscribe](#subscribe)
* [createPrivate](#createPrivate)
* [joinMatch](#joinMatch)
* [matchmake](#matchmake)
* [stopMatchmake](#stopMatchmake)
* [makeMove](#makeMove)
* [checkStatus](#checkStatus)
* [spectateRandomMatch](#spectateRandomMatch)

## Response Types
The following response types will be returned:
* [matchStarted](#matchStarted)
* [moveUpdate](#moveUpdate)

---

## Misc Types

### Position
When `Position` is requested as a parameter, submit one of the following strings
* `topLeft`
* `topCenter`
* `topRight`
* `centerLeft`
* `centerCenter`
* `centerRight`
* `bottomLeft`
* `bottomCenter`
* `bottomRight`

### GameBoard
This type represents the entire layout of the board. It returns the status of every square. Each square can be one of the following.
* `X`: Player X has marked this spot
* `O`: Player O has marked this spot
* ` `: This space is available.
* `tie`: This is used at higher level spots like to sum up an entire localBoard. This isn't used for a specific square.

It also has a `isXTurn` boolean and an `activeSquare` position key / value on the top level.


 A portion of an example is shown below

```json
{
	"isXTurn": true,
	"activeBoard": "topLeft",
	"topLeft": {
		"topLeft": "X",
		"topCenter": "O",
		"topRight": " ",
		...
	},
	"topCenter": {
		"topLeft": "  ",
		"topCenter": "O",
		"topRight": "X" 
	},
	...
}
```

### MakeMoveStatus
This type represents the various statuses that the MakeMove function can return
* Success
* OutOfTurn
* InvalidPosition
* InvalidGame
* UnknownError
* GameNotFound

### WinStatus
Used for describing the current state of the match in relation to a win.

* winChar: Square. Is the enum for the winner (ex: Square.X). If there is no winner, it'll be Square.Empty.
* status: LocalBoard. Describes the board and shows which local boards are available.

#### Example
```json
{
	winChar: 'X',
	status: {
		topLeft: 'X',
		topCenter: 'X',
		topRight: 'X',
		centerLeft: '',
		centerCenter: '',
		centerRight: '',
		bottomLeft: '',
		bottomCenter: '',
		bottomRight: 'O'
	}
}
```

- - - -

## subscribe
Receive updates about and observe a match

### Parameters
* code: string. The two word game code.
* userID: string (optional). If a userID is provided, any players with the same userID will have their userID revealed.

### Example
```json
{
	"action": "subscribe",
	"msgID": "fjsijfiwjdjfdi9323",
	"code": "excited-cat",
	"userID": "ivhjdishjfiwhu8ifw"
}
```

### Response
It'll be the same as [checkStatus](#checkStatus), but new updates will be sent every time a move is made.

## createPrivate
Create a Private Match

### Parameters
* name: string. This should be the name of the player creating the game.
* visible: boolean. This sets whether the match is visible on the home screen or discoverable by other users. If false, it'll only be available if one has the code. Defaults to true if not specified.

#### Example
```json
{
	"action": "createPrivate",
	"msgID": "1234373947394"
	"name": "Lucas",
	"visible": true
}
```

### Response Parameters
* code: string. This is the code that the client should send to other players to join. 
* userID: string. This is the identifier for the user for the current game. This should be sent with all requests relating to this game.

#### Response
```json
{
	"error": false,
	"msgID": "1234373947394",
	"code": "excited-cat",
	"userID": "fdjdisjfiusdjfijsdifjds"
}
```

## joinMatch
Join a match

### Parameters
* code: string. This should be the code provided by some createMatch object.
* name: string. Name of the player

#### Example
```json
{
	"action": "joinMatch",
	"msgID": "12342143423",
	"code": "excited-cat",
	"name": "Lucas"
}
```


### Response Parameters
* started: boolean. If the game has started or not. If true, the gameConfig item and userID will be present.
* gameConfig: see below. Only present if game has started
* userID: Should be sent with every request relating to this game. Identifies the client
* found: boolean. If the record was found or not.

#### gameConfig Schema
```json
{
	"opponent": "opponents name",
	"isX": false, // indicates if the client is x or not (o)
	"gameStart": 1603471401000, // timestamp in milliseconds of when the game started. used for the ingame timer
}
```

#### Example
```json
{
	"error": false,
	"msgID": "12342143423",
	"started": true,
	"gameConfig": {
		"opponent": "John",
		"isX": false,
		"gameStart": 1603471401000
	},
	"code": "excited-cat",
	"userID": "fsdufsfsuhcsncsnifd",
	"found": true
}
```

## matchmake
Create a matchmaking session.

### Parameters
* name: string. This should be the name of the player creating the game.

#### Example
```json
{
	"action": "matchmake",
	"msgID": "1234373947394",
	"name": "Lucas"
}
```

### Response Parameters
* code: string. The game code. Can be sent to others to join.
* userId: string. Should be sent with every request relating to this game. Identifies the client.

#### Example
```json
{
	"error": false,
	"msgID": "1234373947394",
	"userID": "fijdsihfcdjsfijdijf",
	"code": "excited-cat"
}
```

## stopMatchmake
Stop matchmaking for a specific code

### Parameters
* code: string. The game code
* userID: string. The userID issued at beginning of matchmaking.

#### Example
```json
{
	"action": "matchmake",
	"msgID": "12343739f47394",
	"code": "excited-cat"
}
```

### Response Parameters
None

#### Response Example
```json
{
	"error": false,
	"msgID": "12343739f47394",
}
```


## makeMove
Make a move on the board

### Parameters
* board: Position. Out of the nine boards, select which board the player is moving in. Though, in all moves except the first, this should be predetermined. 
* square: Position.  On the selected board, which square does the player wish to move in.
* userID: string. The userID issued at match start
* code: string. The associated game code

#### Example
```json
{
	"action": "makeMove", 
	"msgID": "j439004fndi9f",
	"board": "topLeft",
	"square": "centerCenter",
	"userID": "fsdufsfsuhcsncsnifd",
	"code": "excited-cat"
}
```

### Response Parameters
* board: [GameBoard](#GameBoard). Conforms to the GameBoard type. Gives the new status of the board.
* status: [MakeMoveStatus](#MakeMoveStatus). The result of the make move. Any additional info will be present in `message` if a weird error arises.
* found: boolean. If false, the game was not found. The other properties will not appear if this is false.
* winStatus: [WinStatus](#WinStatus). A newly checked WinStatus.
* code: string. The game code
* gameEnd: number. If it's not zero, the game is over, and this is the timestamp for when the game ended.

#### Example
```json
{
	"error": false,
	"msgID": "j439004fndi9f",
	"board": GameBoard,
	"status": "Success",
	"winStatus": {},// See WinStatus Example
	"code": "excited-cat",
	"gameEnd": 1605029184394
}
```

## checkStatus
Fetch the current status of the game.

### Parameters
* code: string. The match code issued at start of the game.
* userID: string (optional). If a userID is provided, any players with the same userID will have their userID revealed.

#### Example
```json
{
	"action": "checkStatus",
	"msgID": "jiendscnfidsjfds",
	"code": "excited-cat"
}
```

### Response Parameters
*  board: [GameBoard](#GameBoard). Conforms to the GameBoard type. Gives the new status of the board.
* found: boolean. If not true, the game wasn't found and none of the other properties will be present.
* started: boolean. Has the game started yet.
* players: list of objects like such {name: string, isX: boolean}. Gives player info
* winStatus: WinStatus
* gameStart: number. Timestamp in milliseconds when the game started.
* gameEnd: number. Timestamp in milliseconds when the game ended (will be 0 if game is ongoing).

#### Example
```json
{
	"error": false,
	"msgID": "jiendscnfidsjfds",
	"board": GameBoard,
	"started": true,
	"found": true,
	"gameStart": 16034714011234,
	"gameEnd": 1605029184394
	"players": [
		{
			name: "John",
			isX: true
		},
		{
			name: "Lucas",
			isX: false,
			userID: "fidhshiuhdsiuhjfdsid"
		}
	],
	"winStatus": {}// See WinStatus Example
}
```

## spectateRandomMatch
Exact same as [subscribe](#subscribe), but no code is required. A random public match will be picked.

### Response
The response is also the same as subscribe if a match if a match is found. If not, the following will be returned

#### No Match Found Example
```json
{
	"error": false,
	"msgID": "jfidsjifj32rfesf",
	"found": false
}
```

- - - -
## Response Types
These will be returned without any prompting from the client.

## matchStarted
This is sent when the other player has joined, to alert the client that the game has started.

It has the same response as [joinMatch](#joinMatch), except for a `msgType` parameter reading `matchStarted` if being sent to a player.

If it's being sent to a spectator, userID will not be present, and it will look like the example below.

#### Spectator Example
```json
{
	"msgType": "matchStarted",
	"board": GameBoard,
	"started": true,
	"found": true,
	"players": [
		{
			name: "John",
			isX: true
		},
		{
			name: "Lucas",
			isX: false
		}
	],
	"winStatus": {}// See WinStatus Example
}
```

## moveUpdate
This is sent when another player has made a move.

It has the same response as [makeMove](#makeMove), except for the status parameter.

There will also be a `msgType` parameter reading `moveUpdate`
