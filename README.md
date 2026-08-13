# GEUMMONGNYEON APARTMENTS / 금목련아파트

[▶ PLAY ON GITHUB PAGES](https://anchobykim.github.io/GeummongnyeonApartments/)

아날로그 호러와 나폴리탄 규칙 괴담을 결합한 1인칭 웹게임 프로토타입입니다.

## 현재 구현

- 책상 앞에 앉은 제한 회전 1인칭 시점
- 화면 중앙 Dot을 이용한 Raycast 상호작용
- `F`로 CCTV 모니터, 야간 근무 노트, 신고 버튼 사용
- 6개 CCTV 채널과 `A`/`D` 키 전환
- 이상 현상 발생 후 15초간 탐색 유예, 이후 10초간 신호 간섭 경고
- 이상 현상을 직접 목격한 뒤 5초 내 신고해야 성공
- 신고 실패 시 게임 오버
- 게임 시간 00:00부터 06:00까지 생존하면 근무 완료 및 승리
- 현실 시간 5초마다 게임 시간 1분 진행(한 번의 전체 근무 약 30분)
- GitHub Pages 하위 경로 호환 정적 빌드

현재 CCTV에는 `Assets/cctv/vid/normal`과 `Assets/cctv/vid/abnormal`의 4초짜리 임시 MP4 영상 12개가 연결되어 있습니다. 이후 최종 촬영·생성 영상으로 같은 채널 자산을 교체할 예정입니다.

영상은 normal/abnormal 폴더와 채널 키워드로 자동 연결됩니다. 파일명을 바꿀 때에는 다음 키워드 중 해당 채널의 단어 하나를 유지해야 합니다.

| 채널 | 허용 키워드 예시 |
| --- | --- |
| 현관 | `entrance`, `entry`, `lobby` |
| 엘리베이터 | `elevator`, `lift` |
| 비상계단 | `stair`, `stairs`, `stairway` |
| 복도 | `corridor`, `corrider`, `hallway`, `hall` |
| 놀이터 | `playground`, `play`, `yard` |
| 분리수거장 | `recycling`, `recycle`, `rectcling`, `trash`, `garbage` |

파일이 누락되거나 재생되지 않을 경우 해당 채널에는 `NO SIGNAL`이 표시되며 게임은 계속 진행됩니다.

## 조작

| 입력 | 기능 |
| --- | --- |
| 마우스 | 시점 이동 |
| F | 상호작용 / 모니터·노트 닫기 |
| Esc | 모니터·노트 닫기 |
| A / D | CCTV 채널 전환 |

## 로컬 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

정적 결과물은 `dist/`에 생성됩니다. 저장소의 GitHub Pages Source를 **GitHub Actions**로 지정하면 `main` 브랜치 푸시 시 자동 배포됩니다.

## GitHub Pages 공개

1. GitHub에서 새 저장소 `GeummongnyeonApartments`를 만들되 README, `.gitignore`, 라이선스는 추가하지 않습니다.
2. 아래 명령으로 현재 로컬 프로젝트를 새 저장소에 연결합니다.

```bash
git add .
git commit -m "Create first playable prototype"
git remote add origin https://github.com/YOUR_NAME/GeummongnyeonApartments.git
git push -u origin main
```

3. GitHub 저장소의 `Settings → Pages → Build and deployment → Source`에서 `GitHub Actions`를 선택합니다.
4. `Actions` 탭의 `Deploy GEUMMONGNYEON APARTMENTS` 작업이 완료되면 Pages 주소에서 플레이할 수 있습니다.

## 사운드 출처

다음 음원은 Pixabay의 무료 사용 라이선스로 제공됩니다.

- `subhamita-table-fan-sound-01-318509.mp3` — [Subhasis Mandal](https://pixabay.com/ko/users/subhamita-45920507/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=318509), [Pixabay Sound Effects](https://pixabay.com/sound-effects//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=318509)
- `soundshmyak-jump-scares-3-159307.mp3` — [Ilya](https://pixabay.com/ko/users/soundshmyak-38417752/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=159307), [Pixabay Sound Effects](https://pixabay.com/sound-effects//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=159307)
- `farshad_hamzavi-cricket-ambience-night-1-422171.mp3` — [Farshad Hamzavi](https://pixabay.com/ko/users/farshad_hamzavi-45259344/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=422171), [Pixabay Sound Effects](https://pixabay.com/sound-effects//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=422171)
- `freesound_community-radio-static-2-26831.mp3` — [freesound_community](https://pixabay.com/ko/users/freesound_community-46691455/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=26831), [Pixabay Sound Effects](https://pixabay.com/sound-effects//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=26831)
