# Bot Fight Arena

Web app local để upload 2 bot C++ cho Mushroom Game và cho chúng đấu trên 20–50 dataset random.

## Tính năng

- Upload 2 file `.cpp`.
- Backend tự thử `CXX`, Homebrew `g++-15..g++-11`, `clang++`, `g++`, `c++`; đồng thời tự thay `#include <bits/stdc++.h>` / `#include "bits/stdc++.h"` bằng header portable để chạy tốt trên macOS.
- Chọn số dataset từ 20 đến 50.
- Board 10×17 được random toàn bộ ngay lúc bấm **Start Fight**.
- Có option **đảo lượt FIRST/SECOND** cho mỗi dataset.
- Mỗi bot có tổng time 10.000 ms mỗi game.
- Validate nước đi theo luật: rectangle tổng còn lại bằng 10, bốn cạnh đều chạm ít nhất một ô chưa bị xóa.
- Stream/poll live progress, bảng tổng kết, log từng game, export JSON.

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
