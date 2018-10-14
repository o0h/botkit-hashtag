import Hashtag from './Hashtag.js'

export default function(controller) {
  const channelRegExp = /<#([0-9A-Z]+)\|(.+)>/,
    dumpFormatRegExp = /^dump\s+(expand\s)?(<#[0-9A-Z]+\|_[0-9a-zA-Z\-_]+>|#_[0-9a-zA-Z\-_]+)(\s+[0-9.]+h)?$/,
    hashtagFormatRegExp = /#([^\s]+)\s+([^\s]+)/,
    recordRegExp = [/(<#[0-9A-Z]+\|_[0-9a-zA-Z\-_]+>|#_[0-9a-zA-Z\-_]+)\s+(.+)/g]

  const hashtag = new Hashtag({
    token: process.env.SLACK_TOKEN,
    adminToken: process.env.SLACK_ADMIN_TOKEN,
  })

  controller.hears(/^#__ /, ['ambient'], (bot, message) => {
    bot.whisper(message, 'Do you mean `#___` ? (double underscores is not allowed for me.)')
    return
  })

  controller.hears(recordRegExp, ['ambient'], async (bot, message) => {
    // Separate message to channel
    const match = message.match[0]
      .replace(channelRegExp, '#$2')
      .replace(hashtagFormatRegExp, '$1,$2')
      .split(',')
    const distName = match.shift()

    try {
      const { channel: src } = await hashtag.getSource(message)
      const { user } = await hashtag.getMe(message)
      const dist = await hashtag.findDistChannel(distName, user, message)
      bot.reply({ channel: dist.id }, hashtag.getRecordMessage(src, match[0], user, message))
    } catch (err) {
      bot.whisper(message, `ERR:${err}`)
    }
  })

  controller.hears([dumpFormatRegExp], ['direct_mention'], async (bot, message) => {
    const { user } = await hashtag.getMe(message)
    const [, expanded, targetChannelRaw, oldestStr] = message.match
    const channel = await hashtag.findChannel(targetChannelRaw, user)

    if (!channel) {
      bot.whisper(message, `Not found channel ${targetChannelRaw}`)
      return message
    }

    const oldest = hashtag.getOldest(oldestStr ? parseFloat(oldestStr) : 24)
    const { messages: history } = await hashtag.getHistory(channel, oldest)

    if (history.length < 1) {
      return bot.whisper(message, `Not found logs in #${channel.name}`)
    }

    bot.replyInThread(message, {
      text: hashtag.getLogText(history, oldest, expanded),
      as_user: false,
      icon_emoji: ':newspaper:',
      username: `#${channel.name}`,
    })
  })
}
