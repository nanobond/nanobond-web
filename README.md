# Nanobond: Decentralized Micro-Bonds on Hedera

**Democratizing access to capital for SMEs and transparent yields for investors.**

---

## 🚀 The Vision

Nanobond is a decentralized application (dApp) built on the **Hedera Hashgraph** network that bridges the gap between Small and Medium Enterprises (SMEs) needing capital and investors seeking stable, transparent returns.

By leveraging Hedera's high throughput, low fixed fees, and native tokenization capabilities, Nanobond enables the issuance of "Micro-Bonds"—fractionalized debt instruments that are accessible to everyone.

## 🌟 Why Hedera?

We chose Hedera as our infrastructure layer for three critical reasons:

1.  **Hedera Token Service (HTS)**: Native tokenization allows us to mint bond tokens with built-in compliance and royalty features at a fraction of the cost of EVM alternatives.
2.  **Performance & Cost**: Micro-financing requires micro-fees. Hedera's $0.0001 transaction fees ensure that even small investments ($10-$50) remain economically viable.
3.  **Sustainability**: As a green ledger, Hedera aligns with our mission of sustainable, responsible finance.

## 🛠️ Tech Stack

-   **Frontend**: Next.js 16 (React 19), Tailwind CSS, Shadcn UI
-   **Blockchain Interaction**: 
    -   @hashgraph/sdk
    -   @hashgraph/hedera-wallet-connect (WalletConnect v2)
-   **Backend / Auth**: Firebase (Authentication & Firestore)
-   **State Management**: Zustand
-   **Language**: TypeScript

## ✨ Key Features

-   **Issuer Dashboard**: SMEs can register, complete KYC, and issue bond offerings.
-   **Investor Marketplace**: Browse live bond auctions, view risk ratings, and invest directly using HBAR or stablecoins.
-   **Wallet Integration**: Seamless connection with Hedera wallets (HashPack, Blade, etc.) via WalletConnect.
-   **Transparent Portfolio**: Real-time tracking of bond performance and yields.

## 🏁 Getting Started

### Prerequisites

-   Node.js 20+
-   A Firebase project (for Auth & DB)
-   A WalletConnect Project ID (from [reown.com](https://reown.com))

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/your-username/nanobond-web.git
    cd nanobond-web
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env.local` file in the root directory:

    ```env
    # Firebase
    NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

    # WalletConnect (Reown)
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
    
    # App Config
    NEXT_PUBLIC_APP_NAME="Nanobond"
    NEXT_PUBLIC_APP_DESCRIPTION="Decentralized Bond Platform"
    NEXT_PUBLIC_HEDERA_NETWORK="testnet" # or mainnet
    ```

4.  **Run Development Server**
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) to view the dApp.

5.  **Build for Production**
    ```bash
    npm run build
    ```

## 📄 License

This project is open-source and available under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

*Built with ❤️ for the Hedera community.*