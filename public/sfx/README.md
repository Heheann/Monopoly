# 高雄景點大富翁音效覆蓋說明

本專案預設使用內建 WebAudio 合成音效。  
若你想改成自己的音效，請把檔案放到這個資料夾，並使用下列檔名之一：

- `quiz_correct`
- `quiz_wrong`
- `property_buy`
- `property_upgrade`
- `payment_to_player`
- `payment_to_system`
- `payment_waived`
- `shop_buy`
- `card_draw`
- `dice_roll`
- `pass_start_bonus`
- `game_end`

支援副檔名：

- `.mp3`
- `.wav`
- `.ogg`

範例：

- `public/sfx/quiz_correct.mp3`
- `public/sfx/payment_to_player.wav`

建議素材規格：

- 音長：`0.1 ~ 0.8` 秒
- 音量：峰值避免超過 `-1 dB`
- 聲道：單聲道或立體聲皆可

若找不到自訂檔案，系統會自動回退到內建音效。
