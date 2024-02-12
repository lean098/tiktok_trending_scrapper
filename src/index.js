const express = require("express");
const cors = require("cors");

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium-min");

const { load } = require("cheerio");

const wait = (ms) =>
  new Promise((resolve) => setTimeout(() => resolve("OK!"), ms));

const app = express();

app.use(express.json());
app.use(cors());

function scrollPageToBottom(scrollDirection) {
  return async (page, { delay = 100, size = 250, stepsLimit = null } = {}) => {
    let lastScrollPosition = await page.evaluate(
      async (pixelsToScroll, delayAfterStep, limit, direction) => {
        let getElementScrollHeight = (element) => {
          if (!element) return 0;
          let { clientHeight, offsetHeight, scrollHeight } = element;
          return Math.max(scrollHeight, offsetHeight, clientHeight);
        };

        let initialScrollPosition = window.pageYOffset;
        let availableScrollHeight = getElementScrollHeight(document.body);
        let lastPosition = direction === "bottom" ? 0 : initialScrollPosition;

        let scrollFn = (resolve) => {
          let intervalId = setInterval(() => {
            window.scrollBy(
              0,
              direction === "bottom" ? pixelsToScroll : -pixelsToScroll
            );
            lastPosition +=
              direction === "bottom" ? pixelsToScroll : -pixelsToScroll;

            if (
              (direction === "bottom" &&
                lastPosition >= availableScrollHeight) ||
              (direction === "bottom" &&
                limit !== null &&
                lastPosition >= pixelsToScroll * limit) ||
              (direction === "top" && lastPosition <= 0) ||
              (direction === "top" &&
                limit !== null &&
                lastPosition <= initialScrollPosition - pixelsToScroll * limit)
            ) {
              clearInterval(intervalId);
              resolve(lastPosition);
            }
          }, delayAfterStep);
        };

        return new Promise(scrollFn);
      },
      size,
      delay,
      stepsLimit,
      scrollDirection
    );

    return lastScrollPosition;
  };
}

app.get("/", (_, res) => {
  res.status(500).json({ error: "Internal server error" });
});

app.get("/trending", async (req, res) => {
  try {
    const { lng = "pt-BR" } = req.query;
    const url = `https://www.tiktok.com/discover/trending?lang=${lng}`;

    let browser = null;

    const options = process.env.AWS_REGION
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath(
            "https://github.com/Sparticuz/chromium/releases/download/v110.0.1/chromium-v110.0.1-pack.tar"
          ),
          headless: true,
          ignoreHTTPSErrors: true,
        }
      : {
          defaultViewport: null,
          args: ["--start-maximized"],
          executablePath:
            process.platform === "win32"
              ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
              : process.platform === "linux"
              ? "/usr/bin/google-chrome"
              : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          headless: false,
        };

    browser = await puppeteer.launch(options);

    const page = await browser.newPage();

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
      });

      const times = [1, 2, 3, 4, 5];

      for await (const t of times) {
        await wait(150).finally(async () => {
          await scrollPageToBottom("bottom")(page, {
            size: 1000,
            delay: 150,
          });
        });
      }

      const html = await page.content();

      const $ = load(html);

      const mainContent = $("#main-content-discover_kw");

      const videos = [];

      // Videos
      $(mainContent)
        .find('[class*="DivGridContainer"]')
        .contents()
        .each((_, elem) => {
          const views = $(elem).find('[class*="StrongLikes"]').text() ?? "";

          if (!views) return;

          const video = $(elem).find("a").attr("href") ?? "";
          const thumbnail = $(elem).find("img").attr("src") ?? "";
          const user = {
            name: $(elem).find('[data-e2e="video-user-name"]').text(),
            avatar:
              $(elem)
                .find('[data-e2e="video-user-avatar"]')
                .find("img")
                .attr("src") ?? "",
          };
          const like = $(elem).find('[class*="SpanLikes"]').text() ?? "";

          videos.push({
            video: video ? `https://www.tiktok.com${video}` : "",
            thumbnail,
            views,
            like,
            user,
          });
        });

      const users = [];

      // Users
      const usersList = $(mainContent)
        .find('div[class*="DivUserContentBox"]')
        .find('div[class*="DivUserListContainer"]')
        .contents();

      usersList.each((_, user) => {
        const thumbnail = $(user).find("img").attr("src") ?? "";

        if (!thumbnail) return;

        const link = $(user).find("a").attr("href") ?? "";
        const title = $(user)
          .find('[data-e2e="suggest-user-title"]')
          .find("span")
          .text();
        const description = $(user)
          .find('[data-e2e="suggest-user-desc"]')
          .text();
        const followers = $(user).find("p").last().text();

        users.push({
          link: `https://www.tiktok.com${link}`,
          thumbnail,
          title,
          description,
          followers,
        });
      });

      const musics = [];

      // Music
      const musicsList = $(mainContent)
        .find('div[class*="DivMusicContainer"]')
        .find('div[class*="DivMusicListContainer"]')
        .contents();

      musicsList.each((_, music) => {
        const link = $(music).find("a").attr("href") ?? "";
        const thumbnail = $(music).find("img").attr("src") ?? "";
        const name = $(music).find('[data-e2e="music-name"]').text();
        const author = $(music).find('[class*="MusicAuthor"]').text();
        const duration = $(music).find('[class*="DivStats"]').text();

        musics.push({
          link: `https://www.tiktok.com${link}`,
          thumbnail,
          name,
          author,
          duration,
        });
      });

      const hashtags = [];

      // Hashtags
      const hashtagsList = $(mainContent)
        .find('div[class*="DivHashtagContentBox"]')
        .find('div[class*="DivHashtagListContainer"]')
        .contents();

      hashtagsList.each((_, hashtag) => {
        const name = $(hashtag).find('[data-e2e="hashtags-name"]').text();

        if (!name) return;

        const link = $(hashtag).find("a").attr("href") ?? "";
        const views = $(hashtag)
          .find('[data-e2e="hashtags-name"]')
          .next()
          .text();

        hashtags.push({
          link: `https://www.tiktok.com${link}`,
          name,
          views,
        });
      });

      const topics = [];

      // Topics
      const topicsList = $(mainContent)
        .find('div[class*="DivTopicContentBox"]')
        .find('div[class*="DivRelatedWordsContainer"]')
        .contents();

      topicsList.each((_, topic) => {
        const link = $(topic).attr("href") ?? "";

        if (!link) return;

        const name = $(topic).find('[data-e2e="topic-name"]').text();

        topics.push({
          link: `https://www.tiktok.com${link}`,
          name,
        });
      });

      const data = {
        videos,
        users,
        musics,
        hashtags,
        topics,
      };

      return res.status(200).json({ ...data });
    } catch (error) {
      return res
        .status(500)
        .json({ error: "get data from api error", link: "" });
    } finally {
      if (browser !== null) {
        await browser.close();
      }
    }
  } catch (error) {
    res
      .status(500)
      .json({ error: `Internal server error >> ${error}`, data: {} });
  }
});

app.listen(process.env.PORT || 3000);
