# Bot Fight Arena

Web app local để upload 2 bot C++ cho Mushroom Game và cho chúng đấu trên 1–1000 dataset random.

## Tính năng

- Upload 2 file `.cpp`.
- Có thêm tournament analyzer cho nhiều bot với mode `round_robin` và `swiss`.
- Backend tự thử `CXX`, Homebrew `g++-15..g++-11`, `clang++`, `g++`, `c++`; đồng thời tự thay `#include <bits/stdc++.h>` / `#include "bits/stdc++.h"` bằng header portable để chạy tốt trên macOS.
- Chọn số dataset từ 1 đến 1000.
- Board 10×17 được random toàn bộ ngay lúc bấm **Start Fight**.
- Có option **đảo lượt FIRST/SECOND** cho mỗi dataset.
- Mỗi bot có game clock riêng (editable, default 30.000 ms mỗi game), kèm process lifetime cap tự tính theo tổng clock hai bên để tránh kill nhầm giữa game.
- Validate nước đi theo luật: rectangle tổng còn lại bằng 10, bốn cạnh đều chạm ít nhất một ô chưa bị xóa.
- Stream/poll live progress, bảng tổng kết, log từng game, export JSON.

## Mode

### Duel 2 Bots

Mode cũ.

- Upload `botA` và `botB`
- Chạy nhiều dataset
- Có thể bật role-swap trên cùng dataset
- Dùng để soi chi tiết 1 cặp bot

### Round Robin

Mode analyzer nhiều bot.

- Upload nhiều file `.cpp`
- Mỗi simulation cho mọi cặp bot đấu nhau 1 match
- Mỗi match mặc định dùng 1 dataset và chạy 2 game role-swap trên cùng board
- Dùng để scan toàn bộ head-to-head matrix

### Swiss

Mode gần judge thật hơn.

- Upload nhiều file `.cpp`
- Mỗi bot đánh khoảng `swissRounds` match mỗi simulation
- Pairing theo score rồi đến Elo rồi seeded random tiebreak
- Cố tránh gặp lại cùng đối thủ trong cùng simulation
- Dùng để estimate bot nào ổn định, ít thua match, phù hợp môi trường ranking thực

## Match scoring

Tool phân biệt rõ `game` và `match`:

- `game`: 1 lần FIRST vs SECOND trên 1 board
- `match`: 1 cặp bot trên 1 dataset

Nếu bật role-swap, 1 match gồm:

- Game 1: A FIRST, B SECOND
- Game 2: B FIRST, A SECOND

Điểm match từ góc nhìn bot A:

- thắng game: `+1`
- hòa game: `+0.5`
- thua game: `+0`

Tổng điểm match A có thể là:

- `0`
- `0.5`
- `1`
- `1.5`
- `2`

Phân loại match:

- `>= 1.5` -> match win
- `== 1` -> match draw
- `<= 0.5` -> match loss

Đây là chỉ số chính để đọc analyzer, vì nó gần cách đánh giá độ ổn định theo cặp bot hơn là nhìn 1 game đơn lẻ.

## Analytics quan trọng

### simulationCount

Số tournament simulation chạy lặp lại.

- `simulationCount` càng lớn -> thống kê càng ổn định
- nhưng runtime cũng tăng theo

### swissRounds

Số round Swiss trong mỗi simulation.

- ít round -> nhanh hơn, ít tín hiệu hơn
- nhiều round -> ranking đáng tin hơn, runtime dài hơn

### Cách đọc win/draw/loss percentages

Per-bot standings có 2 lớp:

- `match win/draw/loss %`
- `game win/draw/loss %`

Nên ưu tiên đọc `match %` trước.

Ví dụ:

- Bot có `match win %` cao -> thường thắng cả cặp dataset role-swap
- Bot có `match loss %` thấp -> an toàn, ít bị collapse trước đối thủ khó
- Bot có `game win %` cao nhưng `match loss %` vẫn cao -> có thể mạnh nhưng thiếu ổn định

Các cột đáng xem nhất:

- `Power` = average match score
- `Safety` = `1 - match loss rate`
- `Stability` = win/loss có phạt non-ok
- `as FIRST` vs `as SECOND` để biết bot lệch side hay không
- pair matrix để biết thua ai, thắng ai

### Biểu đồ Win/Draw/Loss + độ ổn định

Trên trang standings của tournament có biểu đồ thanh ngang gom `match win/draw/loss %` cho từng bot (sort theo win-rate giảm dần). Mỗi dòng kèm thanh **độ lệch win-rate** (`winRateStdDev`) qua các simulation: thanh càng ngắn nghĩa là bot càng **ổn định** — đây chính là tiêu chí chọn bot tốt (vừa thắng nhiều vừa ít dao động). Hover vào tên bot để xem `avgFinalRank` và tỉ lệ vào top-3.

## Lưu ý về state

Toàn bộ job duel và tournament session được giữ trong RAM (`Map` trong `server.js`), không persist xuống đĩa. **Restart server sẽ mất hết kết quả** — export JSON nếu cần lưu lại. Đây là giới hạn cố ý của bản local v1.

## Cài đặt

```bash
cd bot-fight-arena
npm install
npm start
```

Mở:

```text
http://localhost:3000
```


## Lưu ý macOS

Trên macOS, lệnh `g++` mặc định thường là Apple clang, không có GNU header `bits/stdc++.h`. Bản này đã tự xử lý bằng cách tạo file `.portable.cpp` tạm thời, thay dòng include đó bằng danh sách standard headers phổ biến. Vì vậy các bot kiểu competitive programming dùng:

```cpp
#include <bits/stdc++.h>
```

hoặc:

```cpp
#include "bits/stdc++.h"
```

đều compile được bằng `clang++` nếu không dùng GNU-only extension khác. Nếu bot có dùng extension như PBDS, hãy cài GCC qua Homebrew rồi chạy:

```bash
brew install gcc
CXX=g++-14 npm start
```

## Test engine nhanh

```bash
npm install
npm run test:engine
```

Script này compile sample bot và cho 2 bản sample đấu với nhau 1 game.

## Protocol bot cần hỗ trợ

Backend sẽ gửi:

```text
READY FIRST
```

hoặc:

```text
READY SECOND
```

Bot phải trả:

```text
OK
```

Sau đó backend gửi:

```text
INIT <row0> <row1> ... <row9>
```

Mỗi lượt bot nhận:

```text
TIME <myRemainingMs> <oppRemainingMs>
```

Bot trả một dòng:

```text
r1 c1 r2 c2
```

Pass là:

```text
-1 -1 -1 -1
```

Khi đối thủ đi, bot nhận:

```text
OPP r1 c1 r2 c2 elapsedMs
```

Cuối game:

```text
FINISH
```

## Lưu ý bảo mật

Web app này dành cho chạy local / private. Nó compile và execute code C++ được upload, nên **không nên public trực tiếp lên internet** nếu chưa sandbox bằng Docker, cgroup, user permission riêng, seccomp hoặc VM.

## Chạy trong môi trường tách biệt hơn

Cách đơn giản nhất là chạy server trong container Linux riêng, mount thư mục project và không expose ra public network. Với môi trường thi đấu thật, nên chạy mỗi bot trong sandbox riêng, giới hạn CPU/RAM/process/file-system.
