const WynnCommand = require('../../lib/Structures/WynnCommand');
const { send } = require('@sapphire/plugin-editable-commands');
const { fetchT } = require('@sapphire/plugin-i18next');
const logger = require('../../utils/logger');
const game = require('../../config/game');
const emoji = require('../../config/emoji');
const { SlashCommandBuilder } = require('@discordjs/builders');
const betFaces = ['h', 'heads', 't', 'tails'];
const wait = require('node:timers/promises').setTimeout;
const utils = require('../../lib/utils');

class UserCommand extends WynnCommand {
	constructor(context, options) {
		super(context, {
			...options,
			name: 'coin_flip',
			aliases: ['cf', 'coin_flip'],
			description: 'commands/coin_flip:description',
			usage: 'commands/coin_flip:usage',
			example: 'commands/coin_flip:example',
			cooldownDelay: 20000
		});
	}

	async messageRun(message, args) {
		const t = await fetchT(message);
		const checkCoolDown = await this.container.client.checkTimeCoolDown(message.author.id, this.name, this.options.cooldownDelay, t);
		if (checkCoolDown) {
			return send(message, checkCoolDown);
		}
		const userInfo = await this.container.client.db.fetchUser(message.author.id);

		const first = await args.pick('string').catch(() => null);
		const next = (await args.next()) || undefined;

		let betFace, betMoney;

		if (!Number.isNaN(Number(first))) {
			betMoney = Number(first);
			betFace = next || 'heads';
		} else if (first === 'all') {
			betMoney = userInfo.money > game.cf.max ? game.cf.max : userInfo.money;
			betFace = next || 'heads';
		} else {
			betFace = first;
			betMoney = next ? (next === 'all' ? game.cf.max : Number.isNaN(Number(next)) ? undefined : Number(next)) : game.cf.min;
		}

		if (!betFaces.includes(betFace) || !betMoney) {
			return send(
				message,
				t('commands/coin_flip:inputerror', {
					user: message.author.tag,
					prefix: await this.container.client.fetchPrefix(message)
				})
			);
		}
		return this.mainProcess(betMoney, betFace, message, t, userInfo, message.author.id, message.author.tag);
	}

	async mainProcess(betMoney, betFace, message, t, userInfo, userId, tag) {
		if (betMoney < game.cf.min || betMoney > game.cf.max) {
			return await utils.returnForSlashWithLabelOrSendMessage(
				message,
				t('commands/coin_flip:rangeerror', {
					user: tag,
					min: game.cf.min,
					max: game.cf.max
				}),
				'end'
			);
		}

		if (userInfo.money - betMoney < 0) {
			return await utils.returnForSlashWithLabelOrSendMessage(
				message,
				t('commands/coin_flip:nomoney', {
					user: tag
				}),
				'end'
			);
		}

		const flip = (face) => {
			const faces = { 0: { value: 'heads', aliases: ['h', 'heads'] }, 1: { value: 'tails', aliases: ['t', 'tails'] } };
			const chance = Math.floor(Math.random() * 2);

			return {
				result: faces[chance].aliases.includes(face),
				value: faces[chance].value,
				bet: Object.values(faces).find((item) => item.aliases.includes(face)).value
			};
		};

		const { result, value, bet } = flip(betFace);

		try {
			await this.container.client.db.updateUser(userId, {
				$inc: {
					money: result ? betMoney : -betMoney
				}
			});

			const content1 = t('commands/coin_flip:betting', {
				user: tag,
				bet: betMoney,
				emoji: emoji.common.money,
				emojispin: emoji.game.cf.spin,
				face: t(`commands/coin_flip:${bet}`)
			});

			const content2 = t('commands/coin_flip:result', {
				user: tag,
				money: betMoney,
				status: result ? t('commands/coin_flip:win') : t('commands/coin_flip:lost'),
				value: t(`commands/coin_flip:${value}`),
				face: t(`commands/coin_flip:${bet}`),
				emoji: emoji.common.money,
				emojiResult: result ? emoji.game.cf.win : emoji.game.cf.lose,
				result: result ? betMoney * 2 : betMoney
			});

			if (message.type === 'APPLICATION_COMMAND') {
				return {
					content1: content1,
					content2: content2
				};
			}

			let messageResult = await send(message, content1);
			await wait(1000);
			return messageResult.edit(content2);
		} catch (err) {
			logger.error(err);
			return await send(message, t('other:error', { supportServer: process.env.SUPPORT_SERVER_LINK }));
		}
	}

	async execute(interaction) {
		const t = await fetchT(interaction);
		const checkCoolDown = await this.container.client.checkTimeCoolDown(interaction.user.id, this.name, this.options.cooldownDelay, t);
		if (checkCoolDown) {
			return await interaction.reply(checkCoolDown);
		}
		let userInfo = await this.container.client.db.fetchUser(interaction.user.id);
		// interaction.reply(t('commands/coin_flip:description'));
		let result = await this.mainProcess(
			Number(interaction.options.getInteger('betmoney')),
			interaction.options.getString('betface'),
			interaction,
			t,
			userInfo,
			interaction.user.id,
			interaction.user.tag
		);
		if (result.status === 'end') {
			return await interaction.reply(result.content);
		}
		await interaction.reply(result.content1);
		await wait(1000);
		return await interaction.editReply(result.content2);
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('coin_flip')
		.setDescription('Coin flipping, coin tossing, or head or tail')
		.addIntegerOption((option) => option.setName('betmoney').setDescription('Enter an integer').setRequired(true))
		.addStringOption((option) =>
			option.setName('betface').setDescription('Enter a string').setRequired(true).addChoice('heads', 'heads').addChoice('tails', 'tails')
		),
	UserCommand
};
