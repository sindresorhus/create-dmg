# create-dmg [![Build Status](https://travis-ci.org/sindresorhus/create-dmg.svg?branch=master)](https://travis-ci.org/sindresorhus/create-dmg)

> Create a [DMG](https://en.m.wikipedia.org/wiki/Apple_Disk_Image) from an app *(macOS)*

<img src="screenshot-cli.gif" width="529">

*This tool is intentionally opinionated and simple. I'm not interested in adding lots of options.*


## Install

```
$ npm install --global create-dmg
```


## Usage

```
$ create-dmg --help

  Usage
    $ create-dmg <app>

  Example
    $ create-dmg 'Lungo.app'
```


## DMG

The DMG requires macOS 10.11 or later and has the filename `appName-appVersion.dmg`, for example `Lungo-1.0.0.dmg`.

It will try to code sign the DMG, but the DMG is still created and fine even if the code signing fails, for example if you don't have a developer certificate.

<img src="screenshot-dmg.png" width="772">


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
