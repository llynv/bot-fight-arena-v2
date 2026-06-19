# Bot Fight Arena V2 - Project Detail

## 1. Muc dich project

`bot-fight-arena-v2` la mot web app local de:

- upload 2 bot C++ cho Mushroom Game,
- compile bot tren may local,
- sinh 1 loat board random theo dataset,
- cho 2 bot dau voi protocol co dinh,
- theo doi tien do theo thoi gian thuc,
- xem ket qua tong hop, replay tung game, raw log, stderr, memory, va export JSON.

Project duoc thiet ke de chay local/private. No khong duoc sandbox hoa cho moi truong public.

## 2. Tech stack

- Backend: Node.js + Express
- Upload: `multer`
- Frontend: HTML/CSS/vanilla JavaScript
- Bot runtime: binary C++ duoc compile va execute tren may host
- Test: script Node tu tao bot fixture va chay engine truc tiep

## 3. Cau truc thu muc

```text
bot-fight-arena-v2/
|- package.json
|- README.md
|- server.js
|- src/
|  `- gameEngine.js
|- public/
|  |- index.html
|  |- app.js
|  `- style.css
|- scripts/
|  `- test-engine.js
|- sample-bots/
|  |- sample_first_legal.cpp
|  `- sample_first_legal.cpp.portable.cpp
`- jobs/
   |- <job-id>/...
   |- data-reader/
   |- fast-pass/
   |- slow-clock/
   `- ...
```

## 4. Vai tro tung phan

### `server.js`

Day la entry point cua app backend.

Nhiem vu chinh:

- tao web server,
- phuc vu static frontend trong `public/`,
- nhan upload bot,
- tao va quan ly `job`,
- goi `compileCpp()` va `runFight()` tu `src/gameEngine.js`,
- expose API de frontend poll status, event, game detail, va export ket qua.

### `src/gameEngine.js`

Day la core logic cua he thong.

No chua 4 nhom logic chinh:

- game rules: tao board, state, validate move, apply move, tinh score,
- compile pipeline: compile bot C++ voi nhieu compiler candidate,
- process orchestration: spawn bot, giao tiep stdin/stdout theo line protocol,
- tournament runner: chay nhieu dataset, role-swap, tong hop summary.

### `public/index.html`

Khai bao toan bo UI:

- form upload va setup tran dau,
- khu vuc progress,
- standings,
- ket qua theo dataset,
- game inspector,
- compile logs va live events.

### `public/app.js`

Frontend controller.

Nhiem vu chinh:

- doc input tu form,
- POST len `/api/start`,
- poll `/api/jobs/:id` va `/api/jobs/:id/events`,
- render summary, dataset cards, standings,
- mo replay tung game tu `/api/jobs/:id/games/:gameIndex/detail`,
- hien raw log va stderr.

### `scripts/test-engine.js`

Script regression test cho game engine.

No test nhieu tinh huong khac nhau:

- bot doc `data.bin` dung thu muc,
- timeout theo turn,
- timeout o phase `READY`,
- process lifetime limit,
- memory telemetry,
- summary fields sau khi tong hop.

### `jobs/`

Vua la runtime workspace, vua dang chua mot so fixture/debug folders da co san.

Trong runtime that:

- moi lan start fight se tao `jobs/<job-id>/`,
- source bot upload duoc copy vao day,
- binary bot nam trong `botA/bot` va `botB/bot`,
- optional `data.bin` duoc dat chung thu muc executable cua tung bot.

Luu y: metadata `job` hien tai song trong RAM thong qua `Map`, khong co persistence database.

## 5. Kien truc tong quan

He thong co 3 lop:

1. UI layer
2. HTTP orchestration layer
3. Game engine + bot execution layer

Luong tong quat:

1. User upload 2 file `.cpp` va optional `data.bin`.
2. Frontend goi `POST /api/start`.
3. Backend tao `job`, luu file vao `jobs/<job-id>/`.
4. Backend compile tung bot.
5. Neu compile thanh cong, backend chay `runFight()`.
6. `runFight()` tao danh sach dataset va lan luot goi `runSingleGame()`.
7. Moi game phat sinh event `game_start`, `move`, `game_done`.
8. Frontend poll API va render real-time.
9. User co the xem chi tiet game, raw log, stderr, memory, va export JSON.

## 6. Runtime data model

Moi `job` duoc tao trong `server.js` voi shape tong quat:

```js
{
  id,
  dir,
  createdAt,
  updatedAt,
  status,
  error,
  progress: { done, total, current },
  settings,
  compileLogs,
  summary,
  games,
  fullResults,
  events
}
```

Y nghia cac field quan trong:

- `status`: `queued`, `compiling`, `running`, `done`, `error`
- `settings`: dataset count, clock, role-swap, ten file upload, seed base
- `compileLogs`: stdout/stderr cua moi lan compile bot A/B
- `games`: ban rut gon cua game result, phuc vu list/tong hop
- `fullResults`: full payload cua engine, phuc vu inspector va export
- `events`: stream su kien de frontend poll incremental

## 7. API backend

### `POST /api/start`

Input:

- `botA`, `botB`: file `.cpp` bat buoc
- `botAData`, `botBData`: optional file ten chinh xac la `data.bin`
- `datasetCount`
- `botATimeLimitMs`
- `botBTimeLimitMs`
- `playBothSides`
- `seedBase`

Xu ly:

- validate field upload,
- clamp gia tri input,
- tao `job`,
- tra ve ngay `{ jobId }`,
- tiep tuc compile va run o async task noi bo.

### `GET /api/jobs/:id`

Tra ve public snapshot cua job.

Luu y: `log` va `stderr` trong tung game bi an o endpoint nay de payload nhe hon.

### `GET /api/jobs/:id/events?from=n`

Tra ve event log tang dan tu cursor `from`.

Dung cho polling incremental o frontend.

### `GET /api/jobs/:id/games/:gameIndex/log`

Tra ve raw text log cua game.

### `GET /api/jobs/:id/games/:gameIndex/detail`

Tra ve chi tiet day du cua game:

- summary game,
- `boardRows`,
- `moves`,
- `log`,
- `stderr`,
- `memory`,
- `remaining`.

### `GET /api/jobs/:id/export.json`

Tra ve file JSON gom:

- `job` public snapshot,
- `fullResults` day du.

## 8. Luong compile bot

Compile logic nam o `compileCpp()` trong `src/gameEngine.js`.

### Muc tieu

- chay duoc tren macOS noi `g++` co the la Apple clang,
- van ho tro bot competitive programming dung `bits/stdc++.h`,
- thu nhieu compiler candidate de tang ty le compile thanh cong.

### Cach hoat dong

1. Doc source upload.
2. Neu thay `#include <bits/stdc++.h>` hoac `#include "bits/stdc++.h"` thi thay bang 1 portable header block lon.
3. Tao file `*.portable.cpp` neu can.
4. Thu compile lan luot voi danh sach compiler:
   - `options.compiler`
   - `process.env.CXX`
   - `g++-15` ... `g++-11`
   - `clang++`
   - `g++`
   - `c++`
5. Neu compiler nao thanh cong thi `chmod 755` cho binary va dung lai.
6. Neu tat ca that bai, gom stderr/stdout cua tung compiler roi throw error tong hop.

### He qua kien truc

- app uu tien tinh thuc dung tren local hon la sandbox/security,
- compile path linh hoat, phu hop may macOS co Homebrew GCC hoac chi co clang,
- compile log day du de frontend hien thi khi that bai.

## 9. Game model va rule engine

### Board

- kich thuoc co dinh: `10 x 17`
- moi o ban dau co gia tri so tu `1..9`
- board duoc sinh deterministic neu co `seedBase`

### State

State game duoc bieu dien boi:

```js
{
  val,   // gia tri con lai tren moi o
  own,   // o nay thuoc ve player nao sau khi bi an
  lastPass
}
```

Trong do:

- `val[k] = 0` nghia la o da bi xoa
- `own[k] = 0 | 1 | -1` de track ai an o do
- `lastPass` dung de ket thuc game khi 2 ben pass lien tiep

### Rule cua 1 nuoc di hop le

Move la hinh chu nhat `(r1, c1, r2, c2)` va hop le khi:

1. toa do nam trong board,
2. tong gia tri ben trong hinh chu nhat bang `10`,
3. ca 4 canh `top`, `bottom`, `left`, `right` deu cham it nhat mot o chua bi xoa.

Pass duoc bieu dien bang:

```text
-1 -1 -1 -1
```

### Ket thuc game

Game dung khi:

- co 2 lan pass lien tiep, hoac
- bot timeout, vuot tong clock, illegal move, output khong parse duoc, process exit, process vuot lifetime cap.

### Tinh diem

- moi o da an duoc gan cho player da thuc hien move do,
- score cuoi game la so luong o thuoc ve moi ben,
- neu khong co winner do loi/time, engine so sanh score cuoi cung,
- bang diem A/B luon duoc quy doi ve perspective cua bot A va bot B, khong phu thuoc FIRST/SECOND.

## 10. Random va reproducibility

Board duoc sinh bang cap ham:

- `xmur3()` de hash string seed thanh int,
- `mulberry32()` de random pseudo-deterministic.

Seed cua dataset duoc tao bang:

```text
<seedBase hoac random>#<datasetIndex>
```

Neu `seedBase` rong:

- moi dataset se dung 1 random base moi,
- van co the xem seed trong ket qua/export de reproduce game do.

## 11. Protocol giao tiep voi bot

Moi bot la mot process doc stdin va ghi stdout theo line protocol.

### Handshake

Bot thu nhat nhan:

```text
READY FIRST
```

Bot thu hai nhan:

```text
READY SECOND
```

Ca hai phai tra:

```text
OK
```

### Khoi tao board

Sau handshake, ca hai nhan:

```text
INIT <row0> <row1> ... <row9>
```

### Moi luot di

Bot dang den luot nhan:

```text
TIME <myRemainingMs> <oppRemainingMs>
```

Bot phai tra mot dong:

```text
r1 c1 r2 c2
```

Hoac pass:

```text
-1 -1 -1 -1
```

Bot con lai nhan thong tin move:

```text
OPP r1 c1 r2 c2 elapsedMs
```

### Ket thuc

Engine gui:

```text
FINISH
```

## 12. Process orchestration va time control

Phan nay duoc dong goi trong class `LineProcess` va ham `runSingleGame()`.

### `LineProcess`

Wrapper quanh `spawn()` de:

- start process,
- send line qua stdin,
- buffer stdout theo dong,
- read line co timeout,
- capture stderr,
- sample memory RSS bang lenh `ps`,
- kill process neu vuot lifetime cap.

### 3 lop gioi han thoi gian

1. `READY_TIMEOUT_MS`
   - gioi han cho handshake `READY -> OK`

2. per-bot game clock
   - moi bot co tong budget rieng, default `30000 ms`
   - moi turn, elapsed thuc te duoc tru vao budget

3. process lifetime cap
   - duoc tinh tu tong clock 2 ben + 2 lan ready timeout + grace
   - muc dich: tranh truong hop process song qua lau va bi treo

Dieu nay quan trong vi clock game va process lifetime la hai loai limit khac nhau:

- clock game de xac dinh thang/thua theo luat,
- process lifetime de bao ve host process.

## 13. Luong `runSingleGame()`

`runSingleGame()` la game loop cap thap nhat.

Trinh tu xu ly:

1. tao 2 `LineProcess`
2. build state tu board rows
3. start ca 2 process
4. gui `READY FIRST/SECOND`
5. doi `OK`
6. gui `INIT`
7. loop toi da 500 ply
8. o moi turn:
   - gui `TIME`
   - doi mot dong output
   - do elapsed thuc te
   - update remaining clock
   - parse move
   - validate move
   - apply move
   - sample memory
   - luu `moveRecord`
   - gui `OPP ...` cho doi thu
9. neu 2 pass lien tiep thi finish
10. finally:
   - sample memory lan cuoi
   - gui `FINISH`
   - stop process
11. tra ve result object day du

### Cac status quan trong

- `finished`
- `timeout`
- `time_forfeit`
- `invalid`
- `process_exit`
- `process_limit`
- `error`

## 14. Luong `runFight()`

`runFight()` la orchestration layer cap tournament.

Trinh tu xu ly:

1. clamp `datasetCount` trong khoang `1..1000`
2. tao danh sach dataset `{ index, seed, rows }`
3. tao object `summary`
4. voi tung dataset:
   - neu `playBothSides = true` thi tao 2 pairing
   - pairing 1: A FIRST, B SECOND
   - pairing 2: B FIRST, A SECOND
5. truoc moi game, phat `game_start`
6. goi `runSingleGame()`
7. quy doi score/win/draw ve perspective bot A/B
8. cap nhat `summary`
9. phat `game_done`
10. tra ve `{ summary, datasets, results }`

Y nghia logic:

- fairness theo board seed duoc dam bao khi 2 game role-swap dung cung 1 board,
- summary tong hop luon doc tu goc nhin bot A/B thay vi FIRST/SECOND.

## 15. Frontend flow

Frontend trong `public/app.js` la 1 polling UI, khong dung websocket.

### Start flow

1. user submit form
2. `resetUiForRun()` clear UI cu va chuyen button sang `Starting...`
3. frontend `fetch('/api/start', { method: 'POST', body: FormData })`
4. nhan `jobId`
5. bat dau `setInterval(..., 900)` de poll

### Polling flow

Moi cycle poll:

- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events?from=<cursor>`

Sau do frontend:

- cap nhat progress bar,
- cap nhat status text,
- render summary/standings,
- render ket qua theo dataset,
- render diagnostics,
- append event moi,
- neu game dau tien xuat hien thi auto mo game moi nhat trong inspector.

### Inspector flow

Khi user bam `Inspect`:

1. frontend goi `/api/jobs/:id/games/:gameIndex/detail`
2. nhan full detail cua game
3. set `selectedTurn = moves.length`
4. render board replay, turn details, turn timeline, raw log, stderr

## 16. Rendering logic o UI

UI duoc chia lam nhieu lop hien thi:

### Hero + setup

- preview nhanh clock, process cap, dataset count

### Progress

- status string: `STATUS · current · done/total`
- progress bar
- metrics card summary
- diagnostics card ve memory, slowest move, non-ok games

### Standings

- tong hop A/B wins, draws, losses, total score
- badge +/ - cells lead

### Dataset groups

- group game theo `datasetIndex`
- neu bat role-swap thi 2 game cung dataset dung cung card
- hien state partial neu 1 trong 2 game chua xong

### Game inspector

- danh sach game da xong
- replay controls theo turn
- board grid
- turn timeline
- raw protocol log
- stderr log

## 17. Telemetry va observability

He thong hien tai khong co database hay monitoring service, nhung co telemetry noi bo kha day du:

- compile stdout/stderr
- event stream theo thoi gian
- move-level elapsed time
- move-level remaining time
- move-level legal move count sau move
- process RSS current/max
- per-game raw protocol log
- per-game stderr cua 2 bot

Day la diem manh cua project vi giup debug bot rat nhanh ngay trong local arena.

## 18. Bao mat va gioi han hien tai

Project co tinh chat local tool, khong phai multi-tenant service.

Nhung diem can luu y:

- backend compile va run code C++ upload truc tiep,
- khong co sandbox Docker/cgroup/seccomp/VM,
- `jobs` metadata song trong RAM, restart server se mat,
- process kill dua tren timeout + lifetime cap, khong co isolation tai nguyen o muc he dieu hanh,
- UI dung polling, khong co auth.

Neu muon dua len production/public, can them:

- sandbox process,
- gioi han CPU/RAM/filesystem/network,
- auth,
- persistence cho jobs,
- cleanup strategy cho `jobs/`.

## 19. Test va regression

`npm run test:engine` chay `scripts/test-engine.js`.

Muc dich cua script nay khong chi test happy path, ma con bao ve nhung regression quan trong:

- `data.bin` phai nam dung cwd cua bot,
- timeout can duoc classify dung,
- READY timeout phai tinh la thua,
- process lifetime cap phai phu hop tong thoi gian thuc te,
- summary va telemetry fields phai ton tai day du.

No la regression layer cho `src/gameEngine.js`, khong phai UI test.

## 20. Command va cach chay

### Cai dat

```bash
npm install
```

### Chay app

```bash
npm start
```

Mac dinh server dung `PORT` hoac `5001`. Neu port dang ban, `server.js` se thu `port + 1`.

### Dev mode

```bash
npm run dev
```

### Chay engine regression test

```bash
npm run test:engine
```

## 21. File nao quan trong nhat neu muon sua project

Neu can onboard nhanh, nen doc theo thu tu nay:

1. `README.md`
2. `server.js`
3. `src/gameEngine.js`
4. `public/index.html`
5. `public/app.js`
6. `scripts/test-engine.js`

## 22. Tom tat kien truc

Day la mot local arena nho gon nhung ro rang ve trach nhiem:

- `server.js` quan ly HTTP + job lifecycle,
- `gameEngine.js` quan ly compile, protocol, game rules, va tournament execution,
- `public/app.js` render progress + ket qua bang polling,
- `test-engine.js` giu regression cho core engine.

Gia tri lon nhat cua project nam o 3 diem:

- compile local practical cho bot C++ tren macOS,
- protocol runner va game loop kha chat che,
- telemetry chi tiet de debug bot theo tung game/tung turn.
