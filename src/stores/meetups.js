import { writable } from 'svelte/store';

// private store data, don't bother
const _meetups = writable([]);

// exposing a bunch of public methods
const meetups = {
    subscribe: _meetups.subscribe,
    setMeetups: _meetups.set,
	newMeetup: meetupData => {
		_meetups.update(items => [meetupData, ...items]);
	},
	toggleFavorite: (id) => {
		_meetups.update(items => {
			const meetup = items.find(m => m.id === id);
			if (meetup) {
				meetup.isFavorite = !meetup.isFavorite
			}
			return items;
		})
	},
	editMeetup: (id, meetup) => {
		_meetups.update(items => {
			const meetupIndex = items.findIndex(m => m.id === id);
			if (meetupIndex !== -1) {
				items[meetupIndex] = meetup;
			}
			return items;
		})
	},
	removeMeetup: (id) => {
		_meetups.update(items => items.filter(m => m.id !== id));
	}
}

export default meetups;