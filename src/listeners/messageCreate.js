const { Listener } = require('@sapphire/framework');

class UserEvent extends Listener {
	constructor(context) {
		super(context, {
			once: false,
			event: 'messageCreate'
		});
	}

	async run(message) {
		if (message.author.bot) return;
		if (!message.guild) return;

		await this.container.client.db.fetchUser(message.author.id);
	}
}

exports.UserEvent = UserEvent;
