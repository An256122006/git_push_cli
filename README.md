# 🚀 Git Push Time & GitHub CLI (`git-push-time`)

Một công cụ Dòng lệnh (CLI) mạnh mẽ, hiện đại và toàn diện giúp bạn **đẩy dự án lên Git siêu tốc**, **kết nối GitHub tạo Repository trực tiếp**, **tùy chỉnh lùi thời gian commit (Backdate)** và **tự động bảo vệ chống lộ Key/Secret (GitHub GH013)**.

---

## ✨ Tính năng nổi bật

- 🐙 **Kết nối GitHub & Tạo Repository trực tiếp**:
  - Tạo nhanh repository mới trên GitHub (Public / Private) chỉ trong 3 giây ngay trên terminal.
  - Tự động liên kết remote và đẩy code của dự án lên repo mới vừa tạo.
  - Hỗ trợ lưu trữ Personal Access Token (PAT) an toàn, tự nhận diện token từ `gh CLI` hoặc biến môi trường `GITHUB_TOKEN`.
  - Xem thông tin tài khoản GitHub (Profile), danh sách repository cá nhân và chọn repo trực tiếp không cần copy-paste link.
- ⚡ **Đẩy dự án siêu tốc**: Tự động hóa toàn bộ quy trình `git init`, `git remote`, `git add .`, `git commit`, `git push`.
- ⏰ **Tùy chỉnh thời gian commit (Git Backdate)**:
  - Lùi ngày/giờ bằng cú pháp tự nhiên: `-2d` (2 ngày trước), `-5h` (5 giờ trước), `-1w` (1 tuần trước), `-30m` (30 phút trước).
  - Hoặc nhập mốc thời gian cụ thể: `2024-01-15 14:30:00`.
  - Ghi chuẩn xác cả `GIT_AUTHOR_DATE` và `GIT_COMMITTER_DATE`.
- 🛡️ **Zero-Leak Secret Shield**:
  - Quét trước các file nhạy cảm (`.env`, `.npmrc`, private keys, API keys).
  - Tự động gỡ khỏi stage và bổ sung vào `.gitignore` an toàn mà không làm mất file trên máy của bạn.
  - Tự động squash làm sạch lịch sử unpushed nếu từng vô tình commit key bí mật.
- 🎨 **Giao diện Terminal UI hiện đại**:
  - Thiết kế Dashboard trực quan hiển thị thư mục, branch, trạng thái GitHub.
  - Hỗ trợ nút `« Quay lại` ở tất cả các bước (hoặc gõ `..`).
  - Hộp thoại màu sắc chuẩn Cyberpunk / DevTools sắc nét, không dùng emoji dư thừa.

---

## 📦 Cài đặt

### Cách 1: Cài đặt toàn cục (Khuyên dùng)
```bash
npm install -g git-push-time
```
Sau khi cài đặt, bạn có thể gọi lệnh `git-push-time`, `githubcli` hoặc `git-custom-push` ở bất kỳ thư mục nào!

### Cách 2: Chạy trực tiếp với `npx`
```bash
npx git-push-time
```

---

## 🧭 Quy trình hoạt động (Workflow)

```text
git-push-time github login
        │
        ▼
🌐 GitHub Login (OAuth Device Flow / Personal Access Token)
        │
        ▼
🔑 Mở trình duyệt xác nhận mã User Code & Cấp quyền
        │
        ▼
✅ Đăng nhập thành công!
        │
        ▼
git-push-time
        │
        ├── 📁 1. Chọn folder project
        │
        ├── 👤 2. Chọn GitHub account
        │
        ├── 📦 3. Chọn repository (chọn có sẵn / tạo mới trực tiếp / dán URL)
        │
        ├── 🌿 4. Chọn branch
        │
        ├── 💬 5. Nhập commit message
        │
        ├── ⏰ 6. Chọn commit time (ngay bây giờ / backdate lùi giờ / ngày cụ thể)
        │
        └── 🚀 7. Push (quét secret, commit & đẩy lên remote)
```

---

## 🛠️ Hướng dẫn sử dụng

### 1. Bảng điều khiển tương tác (Interactive Dashboard)
Mở terminal tại thư mục dự án và chạy:
```bash
git-push-time
```
Menu tương tác chính sẽ xuất hiện với các phân mục rõ ràng:
- `» [PUSH]    | Đẩy code lên Git (kèm chọn folder, backdate & chống lộ secret)`
- `» [GITHUB]  | Quản lý GitHub & Tạo repository mới`
- `» [PULL]    | Cập nhật code mới về máy (Fast-forward / Rebase)`
- `» [TIME]    | Sửa thời gian commit lịch sử`
- `» [FIX]     | Quét & gỡ sạch secret khỏi repo`
- `x [THOÁT]   | Kết thúc chương trình`

---

### 2. Tính năng GitHub & Tạo Repository

#### Tạo Repository mới trên GitHub ngay lập tức:
```bash
git-push-time github create
```
Hệ thống sẽ hỏi bạn:
1. **Tên Repository** (Mặc định tự lấy theo tên folder hiện tại).
2. **Mô tả dự án**.
3. **Quyền riêng tư**: Public hoặc Private.
4. **Hỏi đẩy code ngay**: Nếu chọn Có, CLI sẽ tự động liên kết remote và đẩy toàn bộ source code của bạn lên repo vừa tạo!

#### Xem thông tin tài khoản GitHub đang kết nối:
```bash
git-push-time github whoami
```

#### Liệt kê các Repository trên tài khoản GitHub của bạn:
```bash
git-push-time github repos
```

#### Đăng nhập bằng Personal Access Token (PAT):
```bash
git-push-time github login
```
*(Token cần có quyền `repo` để tạo và quản lý repository)*.

#### Đăng xuất:
```bash
git-push-time github logout
```

---

### 3. Đẩy dự án bằng tham số dòng lệnh (Command Line Flags)

#### Ví dụ 1: Lùi thời gian commit 2 ngày trước
```bash
git-push-time -r https://github.com/username/my-repo.git -d "-2d" -m "Initial commit"
```

#### Ví dụ 2: Đặt ngày giờ commit cụ thể trong quá khứ
```bash
git-push-time -r https://github.com/username/my-repo.git -d "2024-01-15 14:30:00" -m "Add core features"
```

#### Ví dụ 3: Đẩy tự động không hỏi lại (-y) và tự gỡ secret (--fix)
```bash
git-push-time -r https://github.com/username/my-repo.git -d "-5h" -m "Update docs" -b main -y --fix
```

#### Ví dụ 4: Chỉ push đúng 1 thư mục con (khi đứng ở thư mục gốc ngoài cùng)
```bash
git-push-time -r https://github.com/username/my-repo.git -m "Init" --dir ./my-app -y
```

---

### 4. Các lệnh độc lập khác

#### Quét và tự động làm sạch Secret:
```bash
git-push-time fix
```

#### Cập nhật code mới từ remote:
```bash
git-push-time pull
```

#### Sửa đổi thời gian commit cũ trong lịch sử:
```bash
git-push-time edit-time
```

---

## 📊 Bảng định dạng thời gian hỗ trợ

| Định dạng ví dụ | Ý nghĩa |
| :--- | :--- |
| `now` hoặc để trống | Thời gian hiện tại |
| `-2d` hoặc `2d` | Lùi lại 2 ngày |
| `-5h` hoặc `5h` | Lùi lại 5 giờ |
| `-30m` hoặc `30m` | Lùi lại 30 phút (m = minute) |
| `-1w` hoặc `1w` | Lùi lại 1 tuần |
| `-3M` / `-3mo` / `-3month` | Lùi lại 3 tháng (M = month, phân biệt hoa/thường với m = minute) |
| `2024-01-15 14:30:00` | Ngày 15/01/2024 lúc 14 giờ 30 phút |
| `2024-01-15` | Ngày 15/01/2024 |

---

## 🏛️ Cấu trúc mã nguồn

```
cli/
├── bin/
│   └── index.js             # CLI Entrypoint & Commander Dispatcher
├── lib/
│   ├── config.js            # Quản lý config & GitHub Token local
│   ├── github.js            # Tương tác GitHub REST API (verify, repos, create)
│   ├── git.js               # Các tác vụ Git cốt lõi
│   ├── secrets.js           # Quét phát hiện secret trong code & stage
│   ├── fix.js               # Thuật toán gỡ secret & squash unpushed
│   ├── utils.js             # Validate url & parse custom datetime
│   ├── prompt-helpers.js    # Interactive prompt helpers có nút Back '..'
│   ├── ui.js                # Design System: Banner, Dashboard, Box & Badges
│   └── commands/
│       ├── push.js          # Wizard push thông minh tích hợp GitHub
│       ├── github.js        # Lệnh & Menu quản lý GitHub / Tạo repo
│       ├── pull.js          # Lệnh pull code (--ff-only, --rebase)
│       ├── edit-time.js     # Lệnh sửa thời gian commit lịch sử
│       └── fix.js           # Lệnh quét & sửa secret độc lập
```

---

## 📄 License
Phát hành theo giấy phép **MIT**.
