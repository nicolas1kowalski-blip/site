using System.Windows;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Surface « continue » pilotable au regard (ex. la zone de coloriage) : à la
    /// différence d'un bouton, chaque nouvel endroit fixé déclenche une action, et
    /// le dwell se ré-arme dès que le regard se déplace de plus de <see cref="ReArmDistance"/>.
    /// </summary>
    public interface IGazeSurface
    {
        /// <summary>Distance (px écran) au-delà de laquelle on relance un nouveau dwell.</summary>
        double ReArmDistance { get; }

        /// <summary>Le point écran vise-t-il un endroit exploitable de la surface ?</summary>
        bool HitTestGaze(Point screenPoint);

        /// <summary>Valide l'action (ex. remplir la région) au point écran donné.</summary>
        void CommitGaze(Point screenPoint);
    }
}
