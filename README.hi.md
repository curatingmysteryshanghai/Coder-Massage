[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **हिन्दी**

# Coder Massage / coder马杀鸡

> AI के इंतज़ार के बीच छोटी-सी रस्में।<br>
> *Small rituals for AI gap time.*

Coder Massage / coder马杀鸡 AI एजेंटों के साथ काम करने वाले लोगों के लिए कम ध्यान माँगने वाले छोटे, हल्के-फुल्के खेलों का संग्रह है। मौजूदा इंस्टॉलेशन के साथ संगतता बनाए रखने के लिए रिपॉज़िटरी की तकनीकी ID `jieya` ही रखी गई है।

<p align="center">
  <img src="./games/needlewhile/design/preview.png" alt="Needlewhile pixel Portal और ऊन के गोले का game" width="100%">
</p>

## हमने इसे क्यों बनाया

वाइब कोडिंग में एक नई तरह का विराम आता है: हम प्रॉम्प्ट भेजते हैं, AI एजेंट काम शुरू करता है और उसके चलने तक हमारा काम खुला रहता है। इस समय को हम **AI gap time** कहते हैं। हर ऐसे विराम को फ़ीड स्क्रॉल करके भरना ज़रूरी नहीं है।

काम के बीच खेले जाने वाले खेल की कुछ व्यावहारिक शर्तें होती हैं: वह कुछ सेकंड में शुरू हो, कभी भी छोड़ा जा सके, आवाज़ या लंबे ध्यान की माँग न करे और उसके बाद काम पर लौटना आसान रहे। ये अनुभव जानबूझकर लक्ष्यहीन हैं—इनमें score, streak, feed या अनिवार्य progress नहीं है। ऐसा कम दबाव वाला खेल digital well-being का एक रूप हो सकता है।

हमारी टीम उन प्रणालियों के आसपास का संबंध और लय डिज़ाइन करती है: इंसान और AI कैसे साथ काम करते, इंतज़ार करते, संभलते और फिर साझा काम पर लौटते हैं।

## अभी उपलब्ध खेल

फिलहाल केवल **[Needlewhile / 扎会儿](./games/needlewhile/)** इंस्टॉल और उपयोगकर्ता परीक्षण के लिए उपलब्ध है।

माउस से क्लिक करें या कोई सामान्य कुंजी दबाएँ—ऊन के गोले में एक सुई लग जाएगी। बस यही छोटी-सी रस्म है। AI के काम करते समय हाथ थोड़ी देर व्यस्त रहते हैं, और काम पूरा होते ही आप आसानी से वापस लौट सकते हैं। Portal पूरी तरह opt-in है; उपयोगकर्ता के इसे खोलने से पहले browser नहीं खुलता।

| क्र. | खेल | श्रेणी | स्थिति | इंस्टॉल योग्य |
| --- | --- | --- | --- | --- |
| 01 | **Needlewhile / 扎会儿** | स्पर्श-आधारित | उपयोगकर्ता परीक्षण जारी | हाँ |

## आगे की दिशा

आगे चलकर collection Portal योग्य खेलों में से किसी एक को रैंडम रूप से चुनेगा। In-game switcher से दूसरे खेल पर जाने के बाद भी उसी AI task की घड़ी चलती रहेगी।

हमारा ध्यान games की संख्या जल्दी बढ़ाने पर नहीं है। हम हर नए अनुभव को यह देखकर जोड़ेंगे कि वह AI के इंतज़ार वाले समय में कितना सहज लगता है। नई खेल-अवधारणाएँ तब तक इंस्टॉल योग्य catalog में शामिल नहीं होंगी, जब तक उनके पास स्वतंत्र package, validation और स्पष्ट release status न हो।

```text
अभी:    Portal → Needlewhile
भविष्य: Portal → random game ↔ in-game switcher ↔ अन्य games
```

अधिक जानकारी के लिए [game catalog](./games/README.md), [architecture](./docs/ARCHITECTURE.md), और [Portal contract](./docs/PORTAL.md) देखें।

## स्थिति

| हिस्सा | स्थिति |
| --- | --- |
| Coder Massage / coder马杀鸡 | शुरुआती विकास में |
| Needlewhile / 扎会儿 | इंस्टॉल योग्य · उपयोगकर्ता परीक्षण जारी |
| Portal द्वारा रैंडम खेल चयन | नियोजित |
| खेल के भीतर switcher | नियोजित |
| अन्य खेल | अभी उपलब्ध नहीं |

## तुरंत इंस्टॉल करें

रिपॉज़िटरी के root में यह command चलाएँ:

```sh
sh ./install.sh --codex
```

अधिक जानकारी:

- [Installation guide](./docs/INSTALLATION.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Adding a game](./docs/ADDING_A_GAME.md)
- [Games directory](./games/README.md)

## इंस्टॉलेशन की ज़िम्मेदारियाँ

AI सहायक ज़रूरी शर्तों की जाँच कर सकता है, रिपॉज़िटरी डाउनलोड कर सकता है, इंस्टॉलर चला सकता है और परिणाम की पुष्टि कर सकता है। Codex Hook को मंज़ूरी देना केवल मालिक का सुरक्षा-संबंधी काम है। मालिक को `UserPromptSubmit`, `PostToolUse` और `Stop` स्वयं जाँचना होगा। AI सहायक को मालिक की ओर से Hook trust मंज़ूर करने या trust records बदलने की अनुमति नहीं है। [इंस्टॉलेशन और सत्यापन नियम](./docs/INSTALLATION.md#installation-responsibilities) का पालन करें।

## नामों के बारे में

`Coder Massage / coder马杀鸡` उत्पाद का नाम है। `jieya` रिपॉज़िटरी और plugin marketplace की compatibility ID है। `Needlewhile / 扎会儿` उपयोगकर्ता परीक्षण में मौजूद पहला game है, और मानक Codex plugin ID `needlewhile@jieya` है।

## गोपनीयता

मौजूदा build स्थानीय रूप से चलता है। Controller random access token का इस्तेमाल करता है और केवल `127.0.0.1` पर bind होता है। Task label को छोटा और सुरक्षित बनाकर केवल memory में रखा जाता है; मूल prompt text disk पर नहीं लिखा जाता। इसमें global keyboard monitoring, Accessibility permission, analytics, accounts, ads या कोई remote game service शामिल नहीं है।

## लाइसेंस

MIT। यह Magic Fan की early-access development release है।
