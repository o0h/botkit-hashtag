import format from 'date-fns/format'
import getHours from 'date-fns/get_hours'
import getMinutes from 'date-fns/get_minutes'
import jaLocale from 'date-fns/locale/ja'
import { mylogAliasList, historyCount } from './constants.js'
const { WebClient } = require('@slack/client')

export default class {
  constructor(options) {
    this.slack = new WebClient(options.token)
    this.adminToken = options.adminToken
  }
  async loadTeamDomain() {
    if (!this.teamDomain) {
      const { team } = await this.slack.team.info()
      this.teamDomain = team.domaing
    }
    return this.teamDomain
  }

  async findDistChannel(name, user, message) {
    // If passed name(as channel name to distribute) is `mylog` channel, rename target channel
    if (mylogAliasList.includes(name)) {
      name = this.getMylogChannelName(user)
    }
    let channel = await this.findChannelByName(name)
    if (!channel) {
      const res = await this.slack.channels.create({ name: name, token: this.adminToken })
      if (res.error) {
        throw new Error(res.error)
      }
      channel = res.channel
      this.slack.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        as_user: true,
        link_names: true,
        text: `Created #${channel.name}`,
      })
    }
    if (channel.is_archived) {
      throw new Error(`\`#${name}\` is exists and archived.`)
    }

    return channel
  }

  async findChannelByName(name) {
    const { channels } = await this.slack.channels.list({ exclude_members: true })
    return channels.find(channel => channel.name === name)
  }

  async findChannel(match, user) {
    if (match.startsWith('<')) {
      return (await this.slack.channels.info({
        channel: match.slice(2, match.indexOf('|')),
      })).channel
    }

    const targetChannelname = mylogAliasList.includes(match.substr(1)) ? this.getMylogChannelName(user) : match
    return await this.findChannelByName(targetChannelname)
  }

  getMe(message) {
    return this.slack.users.info({
      user: message.user,
      token: this.adminToken,
    })
  }

  getHistory(channel, oldest) {
    return this.slack.channels.history({
      channel: channel.id,
      count: historyCount,
      oldest: oldest,
    })
  }

  getSource(message) {
    return this.slack.channels.info({ channel: message.channel })
  }

  getMylogChannelName(user) {
    return `__mylog_${user.name.replace(/\./g, '_')}`.substr(0, 21)
  }

  getOldest(hours) {
    return Date.now() / 1000 - 3600 * hours
  }

  getRecordMessage(src, text, user, message) {
    const postId = `p${message.ts.replace('.', '')}`
    return {
      text: text.trim(),
      as_user: false,
      username: user.name,
      icon_url: user.profile.image_72,
      attachments: [
        {
          title: `in #${src.name}`,
          title_link: `https://${this.loadTeamDomain()}.slack.com/archives/${src.name}/${postId}`,
          ts: message.ts,
        },
      ],
    }
  }

  getLogText(messages, oldest, expanded) {
    const text = [`*from ${new Date(oldest * 1000)}*`, '-----']
    const logs = messages
      .filter(message => message.subtype === 'bot_message')
      .map(message => {
        const date = format(new Date(message.ts * 1000), 'YYYY-MM-DDTHH:mm:ss.SSSZ', { locale: jaLocale }),
          hours = `0${getHours(date).toString()}`.substr(-2),
          minutes = `0${getMinutes(date).toString()}`.substr(-2)

        return expanded
          ? `-- ${hours}:${minutes}\n${message.text}`
          : `${hours}:${minutes} ${message.text.replace(/\n/g, '').substr(0, 30)}`
      })
      .reverse()

    return text.concat(logs).join('\n')
  }
}
