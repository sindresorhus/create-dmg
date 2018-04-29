# create-dmg [![Build Status](https://travis-ci.org/sindresorhus/create-dmg.svg?branch=master)](https://travis-ci.org/sindresorhus/create-dmg)

> Create a good-looking [DMG](https://en.wikipedia.org/wiki/Apple_Disk_Image) for your macOS app in seconds

Imagine you have finished a macOS app, exported it from Xcode, and now want to distribute it to users. The most common way of distributing an app outside the Mac App Store is by putting it in a `.dmg` file. These are hard to create, especially good-looking ones. You can either pay for a GUI app where you have to customize an existing design or you can run some homebrewed Bash script and you still have to design it. This tool does everything for you, so you can play with your 🐈 instead.

<img src="screenshot-cli.gif" width="998">

Discuss it on [Product Hunt](https://www.producthunt.com/posts/create-dmg) and [Twitter](https://twitter.com/sindresorhus/status/846416556754010112).

*This tool is intentionally opinionated and simple. I'm not interested in adding lots of options.*

You might also find my [`LaunchAtLogin`](https://github.com/sindresorhus/LaunchAtLogin) project useful.


## Install

Ensure you have [Node.js](https://nodejs.org) 8 or later installed. Then run the following:

```
$ npm install --global create-dmg
```


## Usage

```
$ create-dmg --help

  Usage
    $ create-dmg <app> [destination]

  Options
    --overwrite  Overwrite existing DMG with the same name

  Examples
    $ create-dmg 'Lungo.app'
    $ create-dmg 'Lungo.app' Build/Releases
```


## DMG

The DMG requires macOS 10.11 or later and has the filename `App Name 0.0.0.dmg`, for example `Lungo 1.0.0.dmg`.

It will try to code sign the DMG, but the DMG is still created and fine even if the code signing fails, for example if you don't have a developer certificate.

<img src="screenshot-dmg.png" width="772">


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
