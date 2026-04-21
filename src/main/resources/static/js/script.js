document.addEventListener('DOMContentLoaded', () => {
    const reservationForm = document.getElementById('reservationForm');
    const tableBody = document.getElementById('reservationTableBody');
    const refreshBtn = document.getElementById('refreshBtn');

    // API Base URL
    const API_URL = '/api/reservations';

    // Fetch and display reservations
    async function fetchReservations() {
        try {
            const response = await fetch(API_URL);
            const reservations = await response.json();
            
            tableBody.innerHTML = '';
            reservations.forEach(res => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="font-weight: 600;">${res.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${res.email}</div>
                    </td>
                    <td>${res.date}</td>
                    <td>${res.time}</td>
                    <td>${res.partySize}</td>
                    <td>
                        <button class="delete-btn" onclick="deleteReservation(${res.id})">Cancel</button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        } catch (error) {
            console.error('Error fetching reservations:', error);
            alert('Failed to load reservations.');
        }
    }

    // Handle form submission
    reservationForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const reservationData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            date: document.getElementById('date').value,
            time: document.getElementById('time').value,
            partySize: parseInt(document.getElementById('partySize').value)
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(reservationData)
            });

            if (response.ok) {
                alert('Reservation confirmed! See you at Lumina.');
                reservationForm.reset();
                fetchReservations();
            } else {
                alert('Failed to create reservation.');
            }
        } catch (error) {
            console.error('Error creating reservation:', error);
            alert('An error occurred. Please try again.');
        }
    });

    // Make deleteReservation global
    window.deleteReservation = async (id) => {
        if (!confirm('Are you sure you want to cancel this reservation?')) return;

        try {
            const response = await fetch(`${API_URL}/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                fetchReservations();
            } else {
                alert('Failed to cancel reservation.');
            }
        } catch (error) {
            console.error('Error deleting reservation:', error);
        }
    };

    refreshBtn.addEventListener('click', fetchReservations);

    // Initial load
    fetchReservations();
});
