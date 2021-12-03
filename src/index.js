const anchor = require("@project-serum/anchor");
const solanaWeb3 = require("@solana/web3.js");
const axios = require("axios");
const bs58 = require("bs58");
const { programs } = require("@metaplex/js");
const {
  metadata: { Metadata },
} = programs;

/* if (!process.env.PROJECT_ADDRESS || !process.env.DISCORD_URL) {
  console.log("please set your environment variables!");
  return;
} */

const updateAuthorities = {
  "GenoS3ck8xbDvYEZ8RxMG3Ln2qcyoAN8CTeZuaWgAoEA": "Genopets",
  "3pMvTLUA9NzZQd4gi725p89mvND1wRNQM3C8XEv1hTdA": "Famous Fox Federation",
  "976smoW7LjLZgzpj3UmVNmHUzbVHJUyLKvp9uqTFtZnp": "Fenix Danjon",
  "EmdsWm9dJ1d6BgQzHDcMJkDvB5SVvpfrAtpiGMVW1gxx": "Portals",
  "aury7LJUae7a92PBo35vVbP61GX8VbyxFKausvUtBrt": "Aurory"
};

//pour les sales l'authority des fox suffit --> logique y'a pas de cession lors d'un listing
const magicEdenKey = new anchor.web3.PublicKey(
  "MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8"
);

const anchorConnection = new anchor.web3.Connection(
  "https://api.mainnet-beta.solana.com"
);

const signaturesPollingInterval = 3000; // ms
const signaturePollingInterval = 1300; // ms

const runSalesBot = async () => {
  console.log("starting listing bot...");

  const options = { limit: 1000 };
  let signatures;

  while (true) {
    try {
      signatures = await anchorConnection.getSignaturesForAddress(
        magicEdenKey,
        options
      );
      if (!signatures.length) {
        console.log("polling...");
        await timer(signaturesPollingInterval);
        continue;
      }
    } catch (err) {
      console.log("error fetching signatures: ", err);
      continue;
    }

    for (let signature of signatures) {
      try {
        signature = signature.signature;
        const tx = await anchorConnection.getTransaction(signature);

        if (tx.meta == null && tx.meta.err != null) {
          continue;
        }

        //get listing price
        const listingPriceData = tx.transaction.message.instructions[0].data;
        const listingPriceHex = bs58.decode(listingPriceData).toString("hex");

        if (listingPriceHex.length !== 34) {
          continue;
        }

        const reversedHex = reverseHex(listingPriceHex);

        //listing date
        const dateString = new Date(tx.blockTime * 1000).toLocaleString();

        const listingPrice =
          parseInt(reversedHex, 16) / solanaWeb3.LAMPORTS_PER_SOL;

        //get token metadata
        try {
          const metadata = await getMetadata(tx.meta.postTokenBalances[0].mint);

          //get update authority
          const updateAuthority = metadata.data.updateAuthority;

          if (!updateAuthorities[updateAuthority]) {
            console.log("don't care tx")
            await timer(signaturePollingInterval);
            continue;
          }

          //get ipfs/arweave data
          const tokenInfo = await axios.get(metadata.data.data.uri);

          //get mint address
          const mintAddress = metadata.data.mint;
          
          printListingInfo(
            dateString,
            listingPrice,
            signature,
            metadata.data.data.name,
            updateAuthority,
            mintAddress,
            tokenInfo.data.image
          );
          await postSaleToDiscord(
            metadata.data.data.name,
            listingPrice,
            dateString,
            mintAddress,
            tokenInfo.data.image
          );
        } catch (err) {
          console.log("couldn't read metadata", err);
        }
      } catch (err) {
        console.log("error getting transaction: ", err);
      }

      lastKnownSignature = signatures[0].signature;

      if (lastKnownSignature) {
        options.until = lastKnownSignature;
      }
      await timer(signaturePollingInterval);
    }
  }
};

runSalesBot();

const getMetadata = async (tokenPubKey) => {
  try {
    const addr = await Metadata.getPDA(tokenPubKey);
    const metadata = await Metadata.load(anchorConnection, addr);

    return metadata;
  } catch (error) {
    console.log("error fetching metadata: ", error);
  }
};

const reverseHex = (hexString) => {
  hexString = hexString.slice(16, hexString.length - 2);
  var reversedHex = "";
  for (let i = hexString.length; i >= 0; i = i - 2) {
    const tmp = hexString.substring(i - 2, i);
    reversedHex += tmp;
  }

  return reversedHex;
};

const timer = (ms) => new Promise((res) => setTimeout(res, ms));

const printListingInfo = (
  date,
  price,
  signature,
  title,
  updateAuthority,
  mintAddress,
  imageURL
) => {
  console.log("-------------------------------------------");
  console.log(`Listing le ${date} ---> ${price} SOL`);
  console.log("Signature: ", signature);
  console.log("Name: ", title);
  console.log("Image: ", imageURL);
  console.log("Update Authority: ", updateAuthority);
  console.log("Mint address : ", mintAddress);
};

const postSaleToDiscord = (title, price, date, mintAddress, imageURL) => {
  axios.post(process.env.DISCORD_BOT, {
    embeds: [
      {
        title: `NEW LISTING`,
        description: `${title}`,
        fields: [
          {
            name: "Price",
            value: `${price} SOL`,
            inline: true,
          },
          {
            name: "Date",
            value: `${date}`,
            inline: true,
          },
          {
            name: "Magic Eden Link",
            value: `https://magiceden.io/item-details/${mintAddress}`,
          },
        ],
        image: {
          url: `${imageURL}`,
        },
      },
    ],
  });
};
