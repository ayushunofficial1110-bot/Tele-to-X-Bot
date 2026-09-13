# Render Deployment Guide (Hindi & English)

यह गाइड आपको इस **X (Twitter) ↔ Telegram Multi-User Automation Bot** को **Render.com** पर आसानी से 100% लाइव डिप्लॉय करने के लिए बनाई गई है।

---

## 1. Render Setup (Quick Steps)

1. **Render.com** पर जाएं और लॉगिन करें।
2. **"New +"** बटन पर क्लिक करें और **"Web Service"** चुनें।
3. अपनी GitHub रिपॉजिटरी को कनेक्ट करें।
4. निम्नलिखित सेटिंग्स भरें:

| Field | Value to Enter |
|---|---|
| **Name** | `x2telegram-bot` (या कोई भी नाम) |
| **Language / Runtime** | `Node` |
| **Region** | `Oregon (US West)` या `Frankfurt (EU)` |
| **Branch** | `main` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node server.js` |
| **Instance Type** | `Free` (या Starter) |

---

## 2. Render Environment Variables

Render के **"Environment"** टैब में जाकर **"Add Environment Variable"** पर क्लिक करें और नीचे दिए गए वेरिएबल्स डालें:

### जरूरी वेरिएबल्स (Required):

1. **`NODE_ENV`**
   - **Value:** `production`
   - *विवरण:* Express और React को प्रोडक्शन ऑप्टिमाइज़्ड मोड में चलाता है।

2. **`APP_URL`**
   - **Value:** `https://your-service-name.onrender.com`
   - *विवरण:* Render आपको जो लाइव URL देगा, उसे यहाँ डालें (बिना आखिरी स्लैश के)। यह Telegram webhook और OAuth कॉलबैक के लिए जरूरी है।

3. **`TELEGRAM_BOT_TOKEN`**
   - **Value:** `@BotFather` से मिला बॉट टोकन (उदा. `123456789:ABCdefGHIjklMNOpqr...`)
   - *विवरण:* बॉट के ऑटोमेशन, मैसेज भेजने और /start हैंडलिंग के लिए।

4. **`GEMINI_API_KEY`**
   - **Value:** Google AI Studio से मिली Gemini API Key
   - *विवरण:* पोस्ट को बिना फैक्ट बदले रीराइट करने और स्पैम/एड डिटेक्ट करने के लिए।

5. **`ADMIN_KEY`**
   - **Value:** कोई भी मजबूत पासवर्ड/सीक्रेट की (उदा. `my_super_secret_admin_2026`)
   - *विवरण:* `/admin` पैनल और सिस्टम सेटिंग्स को सुरक्षित रखने के लिए।

---

### डेटाबेस और X (Twitter) वेरिएबल्स (Recommended / Optional):

6. **`MONGODB_URI`** (Highly Recommended)
   - **Value:** `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/x2telegram?retryWrites=true&w=majority`
   - *विवरण:* MongoDB Atlas (Free Tier) का कनेक्शन स्ट्रिंग। Render की फ्री सर्विस रीस्टार्ट होने पर भी सारे यूज़र्स और ऑटोमेशन हमेशा सुरक्षित रहेंगे। अगर यह खाली छोड़ेंगे तो लोकल फाइल `data/db.json` में डेटा स्टोर होगा।

7. **`TWITTER_CLIENT_ID`**
   - **Value:** Twitter Developer Portal से प्राप्त OAuth 2.0 Client ID
   - *विवरण:* यूज़र्स को 1-क्लिक "Connect X" ऑथराइजेशन देने के लिए।

8. **`TWITTER_CLIENT_SECRET`**
   - **Value:** Twitter Developer Portal से प्राप्त OAuth 2.0 Client Secret
   - *विवरण:* OAuth 2.0 PKCE टोकन एक्सचेंज के लिए।

9. **`TWITTER_BEARER_TOKEN`** (Optional)
   - **Value:** Twitter API v2 Bearer Token
   - *विवरण:* पब्लिक ट्वीट्स को बिना यूज़र लॉगिन मॉनिटर करने के लिए।

---

## 3. Deployment के बाद क्या करें?

1. डिप्लॉयमेंट खत्म होने पर Render लॉग्स में चेक करें:
   ```
   [X2Telegram Server] Running on http://0.0.0.0:10000
   Telegram Bot long-polling worker started.
   ```
2. अपने टेलीग्राम में जाकर अपने बॉट को `/start` भेजें। बॉट तुरंत वेलकम करेगा और गाइडेड ऑनबोर्डिंग शुरू करेगा।
3. अपने Render URL (`https://your-service-name.onrender.com`) को ब्राउज़र में खोलें, वहाँ से वेब डैशबोर्ड और `/admin` पैनल एक्सेस कर सकते हैं।
